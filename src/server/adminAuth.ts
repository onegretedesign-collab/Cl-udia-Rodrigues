import crypto from 'node:crypto';

export type AdminCredentialSource = 'env' | 'claimed' | 'unconfigured';

export interface AdminAuthStatus {
  configured: boolean;
  source: AdminCredentialSource;
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

interface ClaimedCredential {
  usernameNormalized: string;
  displayUsername: string;
  saltHex: string;
  hashHex: string;
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

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function safeEqualStrings(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256Buffer(a), sha256Buffer(b));
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function createAdminAuthService(env: Record<string, string | undefined> = process.env) {
  const signingSecret =
    (env.ADMIN_SESSION_SECRET && env.ADMIN_SESSION_SECRET.trim().length >= 16
      ? env.ADMIN_SESSION_SECRET.trim()
      : null) ?? crypto.randomBytes(32).toString('hex');

  let claimedCredential: ClaimedCredential | null = null;
  const activeSessions = new Map<string, SessionRecord>();
  const failedAttempts = new Map<string, RateLimitEntry>();

  function getEnvCredentials(): { username: string; password: string } | null {
    const rawPassword = env.ADMIN_PANEL_PASSWORD?.trim();
    if (!rawPassword) return null;
    const rawUsername = env.ADMIN_PANEL_USERNAME?.trim() || 'admin';
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
    const password = rawPassword;

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
      const passMatches = safeEqualStrings(rawPassword, envCreds.password);
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
      const actualHash = crypto.scryptSync(rawPassword, salt, 64);
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
    revokeSession,
  };
}
