import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuthService } from './adminAuth';

function signTestJwt(
  privateKeyPem: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): string {
  const headerB64 = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto
    .sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKeyPem)
    .toString('base64url');
  return `${signingInput}.${sig}`;
}

test('first-run setup claims credentials once, issues verifiable Bearer session, and locks setup', () => {
  const auth = createAdminAuthService({});
  assert.equal(auth.getStatus().configured, false);
  assert.equal(auth.getStatus().source, 'unconfigured');
  assert.equal(auth.getStatus().usernameEnvConfigured, false);
  assert.equal(auth.getStatus().authenticated, false);

  // Claim initial credentials
  const claimed = auth.claimInitialCredentials('OwnerDemo', 'secret99');
  assert.equal(claimed.ok, true);
  assert.equal(claimed.status, 201);
  assert.ok(claimed.token);
  assert.equal(claimed.username, 'OwnerDemo');

  // Verify Bearer token
  const status = auth.getStatus(`Bearer ${claimed.token}`);
  assert.equal(status.configured, true);
  assert.equal(status.source, 'claimed');
  assert.equal(status.authenticated, true);
  assert.equal(status.username, 'OwnerDemo');

  // Second setup attempt must be locked (409)
  const secondClaim = auth.claimInitialCredentials('Attacker', 'badpass1');
  assert.equal(secondClaim.ok, false);
  assert.equal(secondClaim.status, 409);

  // Login works case-insensitively for username and strictly for password
  const loginOk = auth.verifyLogin('ownerdemo', 'secret99', '127.0.0.1');
  assert.equal(loginOk.ok, true);
  assert.ok(loginOk.token);

  const loginWrongPass = auth.verifyLogin('OwnerDemo', 'wrongpass', '127.0.0.1');
  assert.equal(loginWrongPass.ok, false);
  assert.equal(loginWrongPass.status, 401);

  // Logout immediately revokes the session server-side
  auth.revokeSession(`Bearer ${claimed.token}`);
  assert.equal(auth.getStatus(`Bearer ${claimed.token}`).authenticated, false);
});

test('environment credentials override first-run claim and enforce rate limiting', () => {
  const auth = createAdminAuthService({
    ADMIN_PANEL_USERNAME: 'StudioOwner',
    ADMIN_PANEL_PASSWORD: 'envPassword123',
  });

  assert.equal(auth.getStatus().configured, true);
  assert.equal(auth.getStatus().source, 'env');
  assert.equal(auth.getStatus().usernameEnvConfigured, true);

  // Setup must be rejected when env secret is configured
  const setupAttempt = auth.claimInitialCredentials('Other', '123456');
  assert.equal(setupAttempt.ok, false);
  assert.equal(setupAttempt.status, 409);

  // Valid env login succeeds
  const ok = auth.verifyLogin('StudioOwner', 'envPassword123', '10.0.0.5');
  assert.equal(ok.ok, true);
  assert.equal(ok.source, 'env');

  // Repeated failures trigger 429 rate limit
  for (let i = 0; i < 10; i++) {
    const fail = auth.verifyLogin('StudioOwner', 'wrong', '10.0.0.9');
    assert.equal(fail.status, 401);
  }
  const blocked = auth.verifyLogin('StudioOwner', 'envPassword123', '10.0.0.9');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
});

test('environment credentials handle accidental quotes, KEY= and Login:/Senha: prefixes, accents, and spaces', () => {
  const auth = createAdminAuthService({
    ADMIN_PANEL_USERNAME: ' Login: "Cláudia" ',
    ADMIN_PANEL_PASSWORD: " Senha: 'pass9876' ",
  });

  assert.equal(auth.getStatus().configured, true);
  assert.equal(auth.getStatus().source, 'env');
  assert.equal(auth.getStatus().usernameEnvConfigured, true);

  // Login without accent and with accidental trailing space in password succeeds
  const ok = auth.verifyLogin('claudia', 'pass9876 ', '10.0.0.12');
  assert.equal(ok.ok, true);
  assert.equal(ok.status, 200);
  assert.equal(ok.username, 'Cláudia');

  // Wrong password still fails with 401
  const fail = auth.verifyLogin('claudia', 'pass0000', '10.0.0.12');
  assert.equal(fail.ok, false);
  assert.equal(fail.status, 401);

  // Missing ADMIN_PANEL_USERNAME reports usernameEnvConfigured=false
  const noUserAuth = createAdminAuthService({ ADMIN_PANEL_PASSWORD: 'onlyPassword' });
  assert.equal(noUserAuth.getStatus().configured, true);
  assert.equal(noUserAuth.getStatus().usernameEnvConfigured, false);
});

test('verifyOwnerGoogleLogin cryptographically validates RS256 Firebase ID tokens and restricts to owner email', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const projectId = 'studio-test-project';
  const nowSec = Math.floor(Date.now() / 1000);
  const auth = createAdminAuthService(
    { ADMIN_PANEL_USERNAME: 'Claudia', ADMIN_PANEL_PASSWORD: 'some-env-password' },
    {
      firebaseProjectId: projectId,
      ownerEmail: 'owner@example.com',
      fetchGoogleCerts: async () => ({ 'test-kid': publicKey }),
    }
  );

  // Valid owner token succeeds and issues active Bearer session
  const ownerToken = signTestJwt(
    privateKey,
    { alg: 'RS256', kid: 'test-kid', typ: 'JWT' },
    {
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'uid-owner-1',
      iat: nowSec - 10,
      exp: nowSec + 3600,
      email: 'owner@example.com',
      email_verified: true,
      name: 'Studio Owner',
    }
  );
  const ok = await auth.verifyOwnerGoogleLogin(ownerToken, '10.0.0.21');
  assert.equal(ok.ok, true);
  assert.equal(ok.status, 200);
  assert.ok(ok.token);
  assert.equal(auth.getStatus(`Bearer ${ok.token}`).authenticated, true);

  // Non-owner verified Google user is rejected with 403
  const strangerToken = signTestJwt(
    privateKey,
    { alg: 'RS256', kid: 'test-kid', typ: 'JWT' },
    {
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'uid-stranger-2',
      iat: nowSec - 10,
      exp: nowSec + 3600,
      email: 'client@example.com',
      email_verified: true,
    }
  );
  const forbidden = await auth.verifyOwnerGoogleLogin(strangerToken, '10.0.0.22');
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.status, 403);

  // Expired token is rejected with 401
  const expiredToken = signTestJwt(
    privateKey,
    { alg: 'RS256', kid: 'test-kid', typ: 'JWT' },
    {
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'uid-owner-1',
      iat: nowSec - 7200,
      exp: nowSec - 60,
      email: 'owner@example.com',
      email_verified: true,
    }
  );
  const expired = await auth.verifyOwnerGoogleLogin(expiredToken, '10.0.0.23');
  assert.equal(expired.ok, false);
  assert.equal(expired.status, 401);

  // Tampered payload is rejected with 401
  const tamperedParts = ownerToken.split('.');
  tamperedParts[1] = Buffer.from(
    JSON.stringify({
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'uid-attacker',
      iat: nowSec - 10,
      exp: nowSec + 3600,
      email: 'owner@example.com',
      email_verified: true,
    })
  ).toString('base64url');
  const tampered = await auth.verifyOwnerGoogleLogin(tamperedParts.join('.'), '10.0.0.24');
  assert.equal(tampered.ok, false);
  assert.equal(tampered.status, 401);
});

test('auto-injected API keys in admin env vars are ignored so first-run setup works and persists across restarts', () => {
  const persisted: {
    value: {
      usernameNormalized: string;
      displayUsername: string;
      saltHex: string;
      hashHex: string;
    } | null;
  } = { value: null };

  const store = {
    load: () => persisted.value,
    save: (cred: NonNullable<typeof persisted.value>) => {
      persisted.value = cred;
    },
  };

  const fakeAutoKey = 'AQ.Ab8RN6ExampleAutoInjectedKeyValue1234567890';
  const envWithAutoKey = {
    GEMINI_API_KEY: fakeAutoKey,
    ADMIN_PANEL_USERNAME: fakeAutoKey,
    ADMIN_PANEL_PASSWORD: fakeAutoKey,
  };

  // First boot: auto-injected API key must be treated as unconfigured
  const boot1 = createAdminAuthService(envWithAutoKey, { credentialStore: store });
  assert.equal(boot1.getStatus().configured, false);
  assert.equal(boot1.getStatus().source, 'unconfigured');

  // User claims their own login/password via first-run setup
  const setup = boot1.claimInitialCredentials('Claudia', 'secret99');
  assert.equal(setup.ok, true);
  assert.equal(setup.status, 201);
  assert.ok(persisted.value);
  assert.notEqual(persisted.value.hashHex, 'secret99');

  // Simulated server restart: claimed scrypt hash reloads and authenticates cleanly
  const boot2 = createAdminAuthService(envWithAutoKey, { credentialStore: store });
  assert.equal(boot2.getStatus().configured, true);
  assert.equal(boot2.getStatus().source, 'claimed');

  const loginOk = boot2.verifyLogin('claudia', 'secret99', '10.0.0.30');
  assert.equal(loginOk.ok, true);
  assert.equal(loginOk.status, 200);
});
