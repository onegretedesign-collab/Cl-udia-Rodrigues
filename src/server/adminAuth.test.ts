import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuthService } from './adminAuth';

test('first-run setup claims credentials once, issues verifiable Bearer session, and locks setup', () => {
  const auth = createAdminAuthService({});
  assert.equal(auth.getStatus().configured, false);
  assert.equal(auth.getStatus().source, 'unconfigured');
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
