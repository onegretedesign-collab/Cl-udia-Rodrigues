import crypto from 'node:crypto';

export type AdminCredentialSource = 'env' | 'claimed' | 'unconfigured';

export interface AdminAuthStatus {
  configured: boolean;
  source: AdminCredentialSource;
  usernameEnvConfigured: boolean;
  authenticated: boolean;
  username?: string;
}

export interface AdminAuthResult {
  ok: boolean;
  status: number;
  error?: string;
  token?: string;
  username?: string;
  expiresAt?: string;
  source?: AdminCredentialSource;
}

export interface ClaimedCredential {
  usernameNormalized: string;
  displayUsername: string;
  saltHex: string;
  hashHex: string;
}

export interface ClaimedCredentialStore {
  load: () => ClaimedCredential | null;
  save: (credential: ClaimedCredential) => void;
}

export interface AdminAuthServiceOptions {
  firebaseProjectId?: string;
  ownerEmail?: string;
  fetchGoogleCerts?: () => Promise<Record<string, string>>;
  credentialStore?: ClaimedCredentialStore;
}

interface SessionRecord {
  jti: string;
  username: string;
  expiresAtMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAtMs: number;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const FIREBASE_PUBLIC_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

async function defaultFetchGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && cachedCerts.expiresAtMs > now) {
    return cachedCerts.certs;
  }

  const res = await fetch(FIREBASE_PUBLIC_CERTS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch Firebase public certificates.');
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') ?? '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.min(Number(maxAgeMatch[1]), 86400) : 3600;
  cachedCerts = {
    certs,
    expiresAtMs: now + Math.max(maxAgeSec, 60) * 1000,
  };
  return certs;
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function safeEqualStrings(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256Buffer(a), sha256Buffer(b));
}

function normalizeUsername(username: string): string {
  return username
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function sanitizeEnvValue(
  raw: string | undefined,
  envKeyName?: string,
  labelPattern?: RegExp
): string {
  if (typeof raw !== 'string') return '';
  let value = raw.trim();

  // Strip accidental "ENV_KEY=..." prefix if the whole .env line was pasted into Secrets
  if (envKeyName) {
    const keyPrefixPattern = new RegExp(`^${envKeyName}\\s*=\\s*`, 'i');
    value = value.replace(keyPrefixPattern, '').trim();
  }

  // Strip accidental matching surrounding quotes ("..." or '...' or `...`)
  const stripQuotes = (input: string): string => {
    let out = input.trim();
    while (
      out.length >= 2 &&
      ((out.startsWith('"') && out.endsWith('"')) ||
        (out.startsWith("'") && out.endsWith("'")) ||
        (out.startsWith('`') && out.endsWith('`')))
    ) {
      out = out.slice(1, -1).trim();
    }
    return out;
  };

  value = stripQuotes(value);

  // Strip accidental label prefix such as "Login: Claudia" or "Senha: 124578"
  if (labelPattern) {
    value = value.replace(labelPattern, '').trim();
    value = stripQuotes(value);
  }

  return value;
}

function isAutoInjectedApiKeyOrPlaceholder(
  value: string,
  geminiApiKey?: string
): boolean {
  if (!value) return false;
  if (geminiApiKey && value === geminiApiKey) return true;
  if (/^AQ\.[A-Za-z0-9._-]{20,}$/.test(value)) return true;
  if (/^AIza[A-Za-z0-9_-]{20,}$/.test(value)) return true;
  if (/^MY_[A-Z0-9_]+$/.test(value)) return true;
  return false;
}

export function createAdminAuthService(
  env: Record<string, string | undefined> = process.env,
  options: AdminAuthServiceOptions = {}
) {
  const signingSecret =
    (env.ADMIN_SESSION_SECRET && env.ADMIN_SESSION_SECRET.trim().length >= 16
      ? env.ADMIN_SESSION_SECRET.trim()
      : null) ?? crypto.randomBytes(32).toString('hex');

  const firebaseProjectId = options.firebaseProjectId?.trim() || '';
  const ownerEmail = (options.ownerEmail || 'onegretedesign@gmail.com').trim().toLowerCase();
  const fetchGoogleCerts = options.fetchGoogleCerts ?? defaultFetchGoogleCerts;
  const credentialStore = options.credentialStore;
  const sanitizedGeminiKey = sanitizeEnvValue(env.GEMINI_API_KEY, 'GEMINI_API_KEY');

  let claimedCredential: ClaimedCredential | null = credentialStore?.load() ?? null;
  const activeSessions = new Map<string, SessionRecord>();
  const failedAttempts = new Map<string, RateLimitEntry>();

  function getSanitizedEnvUsername(): string {
    const value = sanitizeEnvValue(
      env.ADMIN_PANEL_USERNAME,
      'ADMIN_PANEL_USERNAME',
      /^(?:login|usu[aá]rio|user(?:name)?)\s*:\s+/i
    );
    return isAutoInjectedApiKeyOrPlaceholder(value, sanitizedGeminiKey) ? '' : value;
  }

  function getEnvCredentials(): { username: string; password: string } | null {
    const rawPassword = sanitizeEnvValue(
      env.ADMIN_PANEL_PASSWORD,
      'ADMIN_PANEL_PASSWORD',
      /^(?:senha|password)\s*:\s+/i
    );
    if (!rawPassword || isAutoInjectedApiKeyOrPlaceholder(rawPassword, sanitizedGeminiKey)) {
      return null;
    }
    const rawUsername = getSanitizedEnvUsername() || 'admin';
    return { username: rawUsername, password: rawPassword };
  }

  function getCredentialSource(): AdminCredentialSource {
    if (getEnvCredentials()) return 'env';
    if (claimedCredential) return 'claimed';
    return 'unconfigured';
  }

  function pruneExpiredSessions(nowMs: number): void {
    for (const [jti, session] of activeSessions.entries()) {
      if (session.expiresAtMs <= nowMs) {
        activeSessions.delete(jti);
      }
    }
  }

  function checkRateLimit(clientKey: string, nowMs: number): boolean {
    const entry = failedAttempts.get(clientKey);
    if (!entry) return true;
    if (entry.resetAtMs <= nowMs) {
      failedAttempts.delete(clientKey);
      return true;
    }
    return entry.count < RATE_LIMIT_MAX_ATTEMPTS;
  }

  function recordFailedAttempt(clientKey: string, nowMs: number): void {
    const existing = failedAttempts.get(clientKey);
    if (!existing || existing.resetAtMs <= nowMs) {
      failedAttempts.set(clientKey, {
        count: 1,
        resetAtMs: nowMs + RATE_LIMIT_WINDOW_MS,
      });
    } else {
      existing.count += 1;
    }
  }

  function clearFailedAttempts(clientKey: string): void {
    failedAttempts.delete(clientKey);
  }

  function issueSessionToken(username: string, nowMs = Date.now()): {
    token: string;
    expiresAt: string;
  } {
    pruneExpiredSessions(nowMs);
    const jti = crypto.randomBytes(18).toString('base64url');
    const expiresAtMs = nowMs + SESSION_TTL_MS;

    const payloadJson = JSON.stringify({
      sub: username,
      jti,
      exp: expiresAtMs,
    });
    const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
    const sigB64 = crypto
      .createHmac('sha256', signingSecret)
      .update(payloadB64)
      .digest('base64url');

    activeSessions.set(jti, { jti, username, expiresAtMs });
    return {
      token: `${payloadB64}.${sigB64}`,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  function extractBearerToken(authHeader?: string | null): string | null {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const trimmed = authHeader.trim();
    if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
    const token = trimmed.slice(7).trim();
    return token.length > 0 && token.length <= 1024 ? token : null;
  }

  function verifyToken(token: string | null, nowMs = Date.now()): SessionRecord | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const expectedSig = crypto
      .createHmac('sha256', signingSecret)
      .update(payloadB64)
      .digest('base64url');

    if (!safeEqualStrings(sigB64, expectedSig)) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8')
      ) as Partial<{ sub: string; jti: string; exp: number }>;

      if (
        typeof parsed.jti !== 'string' ||
        typeof parsed.sub !== 'string' ||
        typeof parsed.exp !== 'number'
      ) {
        return null;
      }

      if (parsed.exp <= nowMs) {
        activeSessions.delete(parsed.jti);
        return null;
      }

      const stored = activeSessions.get(parsed.jti);
      if (!stored || stored.expiresAtMs <= nowMs) {
        return null;
      }
      return stored;
    } catch {
      return null;
    }
  }

  function getStatus(authHeader?: string | null): AdminAuthStatus {
    const source = getCredentialSource();
    const session = verifyToken(extractBearerToken(authHeader));
    return {
      configured: source !== 'unconfigured',
      source,
      usernameEnvConfigured: getSanitizedEnvUsername().length > 0,
      authenticated: Boolean(session),
      username: session?.username,
    };
  }

  function claimInitialCredentials(
    rawUsername: unknown,
    rawPassword: unknown
  ): AdminAuthResult {
    const source = getCredentialSource();
    if (source !== 'unconfigured') {
      return {
        ok: false,
        status: 409,
        error: 'O login do painel já foi configurado.',
      };
    }

    if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
      return {
        ok: false,
        status: 400,
        error: 'Informe um login e uma senha válidos.',
      };
    }

    const displayUsername = rawUsername.trim();
    const password = rawPassword.trim();

    if (displayUsername.length < 2 || displayUsername.length > 64) {
      return {
        ok: false,
        status: 400,
        error: 'O login deve ter entre 2 e 64 caracteres.',
      };
    }

    if (password.length < 6 || password.length > 128) {
      return {
        ok: false,
        status: 400,
        error: 'A senha deve ter entre 6 e 128 caracteres.',
      };
    }

    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(password, salt, 64);

    claimedCredential = {
      usernameNormalized: normalizeUsername(displayUsername),
      displayUsername,
      saltHex: salt.toString('hex'),
      hashHex: derived.toString('hex'),
    };
    credentialStore?.save(claimedCredential);

    const { token, expiresAt } = issueSessionToken(displayUsername);
    return {
      ok: true,
      status: 201,
      token,
      username: displayUsername,
      expiresAt,
      source: 'claimed',
    };
  }

  function verifyLogin(
    rawUsername: unknown,
    rawPassword: unknown,
    clientKey = 'default',
    nowMs = Date.now()
  ): AdminAuthResult {
    const source = getCredentialSource();
    if (source === 'unconfigured') {
      return {
        ok: false,
        status: 409,
        error: 'Configure o login inicial do painel antes de entrar.',
      };
    }

    if (!checkRateLimit(clientKey, nowMs)) {
      return {
        ok: false,
        status: 429,
        error: 'Muitas tentativas incorretas. Aguarde alguns minutos para tentar novamente.',
      };
    }

    if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 400,
        error: 'Informe login e senha.',
      };
    }

    const normalizedInputUser = normalizeUsername(rawUsername);
    if (!normalizedInputUser || rawPassword.length === 0 || rawPassword.length > 128) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 401,
        error: 'Login ou senha inválidos.',
      };
    }

    const envCreds = getEnvCredentials();
    if (envCreds) {
      const userMatches = safeEqualStrings(
        normalizedInputUser,
        normalizeUsername(envCreds.username)
      );
      const trimmedInputPassword = rawPassword.trim();
      const passMatches =
        safeEqualStrings(rawPassword, envCreds.password) ||
        (trimmedInputPassword.length > 0 &&
          safeEqualStrings(trimmedInputPassword, envCreds.password));
      if (!userMatches || !passMatches) {
        recordFailedAttempt(clientKey, nowMs);
        return {
          ok: false,
          status: 401,
          error: 'Login ou senha inválidos.',
        };
      }

      clearFailedAttempts(clientKey);
      const { token, expiresAt } = issueSessionToken(envCreds.username, nowMs);
      return {
        ok: true,
        status: 200,
        token,
        username: envCreds.username,
        expiresAt,
        source: 'env',
      };
    }

    if (claimedCredential) {
      const userMatches = safeEqualStrings(
        normalizedInputUser,
        claimedCredential.usernameNormalized
      );
      const salt = Buffer.from(claimedCredential.saltHex, 'hex');
      const expectedHash = Buffer.from(claimedCredential.hashHex, 'hex');
      const actualHash = crypto.scryptSync(rawPassword.trim(), salt, 64);
      const passMatches =
        actualHash.length === expectedHash.length &&
        crypto.timingSafeEqual(actualHash, expectedHash);

      if (!userMatches || !passMatches) {
        recordFailedAttempt(clientKey, nowMs);
        return {
          ok: false,
          status: 401,
          error: 'Login ou senha inválidos.',
        };
      }

      clearFailedAttempts(clientKey);
      const { token, expiresAt } = issueSessionToken(claimedCredential.displayUsername, nowMs);
      return {
        ok: true,
        status: 200,
        token,
        username: claimedCredential.displayUsername,
        expiresAt,
        source: 'claimed',
      };
    }

    return {
      ok: false,
      status: 401,
      error: 'Login ou senha inválidos.',
    };
  }

  async function verifyOwnerGoogleLogin(
    rawIdToken: unknown,
    clientKey = 'default',
    nowMs = Date.now()
  ): Promise<AdminAuthResult> {
    if (!firebaseProjectId) {
      return {
        ok: false,
        status: 503,
        error: 'Autenticação Google administrativa indisponível neste servidor.',
      };
    }

    if (!checkRateLimit(clientKey, nowMs)) {
      return {
        ok: false,
        status: 429,
        error: 'Muitas tentativas incorretas. Aguarde alguns minutos para tentar novamente.',
      };
    }

    if (typeof rawIdToken !== 'string' || rawIdToken.length < 32 || rawIdToken.length > 8192) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 400,
        error: 'Token Google inválido.',
      };
    }

    const parts = rawIdToken.split('.');
    if (parts.length !== 3) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 401,
        error: 'Token Google malformado.',
      };
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    let header: Partial<{ alg: string; kid: string }>;
    let payload: Partial<{
      aud: string;
      iss: string;
      sub: string;
      exp: number;
      iat: number;
      email: string;
      email_verified: boolean;
      name: string;
    }>;

    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 401,
        error: 'Não foi possível validar sua sessão Google.',
      };
    }

    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 401,
        error: 'Assinatura de token Google não suportada.',
      };
    }

    let certs: Record<string, string>;
    try {
      certs = await fetchGoogleCerts();
    } catch {
      return {
        ok: false,
        status: 503,
        error: 'Não foi possível verificar as credenciais Google agora. Tente novamente.',
      };
    }

    const certPem = certs[header.kid];
    if (!certPem) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 401,
        error: 'Sessão Google expirada. Faça login novamente.',
      };
    }

    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
    const signatureBuf = Buffer.from(signatureB64, 'base64url');
    let signatureValid = false;
    try {
      signatureValid = crypto.verify('RSA-SHA256', signingInput, certPem, signatureBuf);
    } catch {
      signatureValid = false;
    }

    const nowSec = Math.floor(nowMs / 1000);
    const expectedIssuer = `https://securetoken.google.com/${firebaseProjectId}`;
    const claimsValid =
      signatureValid &&
      payload.aud === firebaseProjectId &&
      payload.iss === expectedIssuer &&
      typeof payload.sub === 'string' &&
      payload.sub.length > 0 &&
      typeof payload.exp === 'number' &&
      payload.exp > nowSec &&
      typeof payload.iat === 'number' &&
      payload.iat <= nowSec + 300;

    if (!claimsValid) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 401,
        error: 'Sessão Google inválida ou expirada. Entre novamente.',
      };
    }

    const tokenEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!payload.email_verified || !tokenEmail || !safeEqualStrings(tokenEmail, ownerEmail)) {
      recordFailedAttempt(clientKey, nowMs);
      return {
        ok: false,
        status: 403,
        error: 'Esta conta Google não tem permissão de administradora do painel.',
      };
    }

    clearFailedAttempts(clientKey);
    const displayName =
      getSanitizedEnvUsername() ||
      (typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : tokenEmail);
    const { token, expiresAt } = issueSessionToken(displayName, nowMs);
    return {
      ok: true,
      status: 200,
      token,
      username: displayName,
      expiresAt,
      source: getCredentialSource(),
    };
  }

  function revokeSession(authHeader?: string | null): void {
    const token = extractBearerToken(authHeader);
    const session = verifyToken(token);
    if (session) {
      activeSessions.delete(session.jti);
    }
  }

  return {
    getStatus,
    claimInitialCredentials,
    verifyLogin,
    verifyOwnerGoogleLogin,
    revokeSession,
  };
}
