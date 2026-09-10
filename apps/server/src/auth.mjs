/**
 * Passcodes and bearer tokens.
 *
 * Identity matters here because the regulations attach to a named person:
 * who took the photograph (IPS 21(4)(a)), who signed (21(5)), who verified a
 * corrective action (reg 6.24). A signed-in user is what makes those records
 * attributable rather than asserted.
 *
 * Passcode: scrypt, per-user random salt, stored as "scrypt$<salt>$<hash>".
 * Token: 32 random bytes, handed to the device once, stored as SHA-256 only.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const TOKEN_TTL_DAYS = 30;

export function hashPasscode(passcode) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(passcode), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPasscode(passcode, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(String(passcode), salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

/**
 * Every seeded person's passcode comes from the environment: user 1 from
 * ASSURE_PASSCODE, the role addresses from ASSURE_PASSCODE_REVIEWER and
 * ASSURE_PASSCODE_VIEWER. Absent variable, no change; changed value, rotated.
 */
export async function ensurePasscodesFromEnv(db) {
  const out = [];
  out.push(await ensurePasscodeFromEnv(db, 1));
  for (const [email, env] of [
    ['reviewer@assuresafety.co.nz', 'ASSURE_PASSCODE_REVIEWER'],
    ['viewer@assuresafety.co.nz', 'ASSURE_PASSCODE_VIEWER'],
  ]) {
    const pass = process.env[env];
    if (!pass) continue;
    const r = await db.query(`SELECT id, passcode_hash FROM app_user WHERE lower(email) = lower($1)`, [email]);
    if (!r.rows.length) continue;
    if (verifyPasscode(pass, r.rows[0].passcode_hash)) continue;
    await db.query(`UPDATE app_user SET passcode_hash = $2 WHERE id = $1`, [r.rows[0].id, hashPasscode(pass)]);
    out.push({ applied: true, email });
  }
  return out;
}

export async function ensurePasscodeFromEnv(db, userId = 1) {
  const pass = process.env.ASSURE_PASSCODE;
  if (!pass) return { applied: false };
  const r = await db.query(`SELECT passcode_hash FROM app_user WHERE id = $1`, [userId]);
  if (!r.rows.length) return { applied: false };
  if (verifyPasscode(pass, r.rows[0].passcode_hash)) return { applied: false };
  await db.query(`UPDATE app_user SET passcode_hash = $2 WHERE id = $1`, [userId, hashPasscode(pass)]);
  return { applied: true };
}

/** @returns {{ token, user } | null} null when the credentials do not match. */
export async function login(db, { email, passcode, deviceId }) {
  const r = await db.query(
    `SELECT id, full_name, occupation, email, role, authorisation_number, passcode_hash
     FROM app_user WHERE lower(email) = lower($1) AND active`,
    [email ?? '']
  );
  const u = r.rows[0];
  // Verify against a dummy hash when the user is unknown so timing does not
  // reveal which emails exist.
  const ok = verifyPasscode(passcode, u?.passcode_hash ?? 'scrypt$00$00');
  if (!u || !ok) return null;

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400e3).toISOString();
  await db.query(
    `INSERT INTO auth_token (token_hash, user_id, device_id, expires_at) VALUES ($1,$2,$3,$4)`,
    [tokenHash(token), u.id, deviceId ?? null, expires]
  );
  return {
    token,
    expiresAt: expires,
    user: {
      id: u.id, fullName: u.full_name, occupation: u.occupation, email: u.email,
      role: u.role, authorisationNumber: u.authorisation_number,
    },
  };
}

/** @returns {{ userId, deviceId } | null} */
export async function authenticate(db, token) {
  if (!token) return null;
  const r = await db.query(
    `SELECT t.user_id, t.device_id, u.role FROM auth_token t
     JOIN app_user u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now() AND u.active`,
    [tokenHash(token)]
  );
  if (!r.rows.length) return null;
  return { userId: Number(r.rows[0].user_id), deviceId: r.rows[0].device_id, role: r.rows[0].role };
}

export async function logout(db, token) {
  if (!token) return;
  await db.query(`UPDATE auth_token SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash(token)]);
}

/** Bearer header first, then ?token= for pages the browser opens on its own. */
export function tokenFromRequest(req) {
  const h = req.header('authorization') ?? '';
  const m = h.match(/^Bearer\s+(\S+)$/i);
  if (m) return m[1];
  const q = req.query?.token;
  return typeof q === 'string' && q ? q : null;
}
