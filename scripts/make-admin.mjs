/**
 * Promote an existing user to administrator and set their password.
 *
 *   node --env-file=.env scripts/make-admin.mjs someone@example.com 'their-password'
 *
 * You do not need this for the main admin — that one is created automatically
 * at boot from ADMIN_EMAIL / ADMIN_PASSWORD in .env. Use this to add extra
 * administrators, or to reset one's password.
 */
import mysql from 'mysql2/promise';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };
const MIN_PASSWORD_LENGTH = 12;

// Must stay in step with lib/password.ts
async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node --env-file=.env scripts/make-admin.mjs <email> '<password>'");
  process.exit(1);
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'tradeflow',
});

try {
  const [rows] = await connection.query('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
  if (rows.length === 0) {
    console.error(`No user with email ${email}. Register through the app first, then re-run this.`);
    process.exit(1);
  }

  const user = rows[0];
  await connection.query("UPDATE users SET role = 'admin', is_active = 1, password_hash = ? WHERE id = ?", [
    await hashPassword(password),
    user.id,
  ]);
  console.log(`${user.name} <${user.email}> is now an admin (was role='${user.role}').`);
  console.log('Sign in at /admin/login with that email and password.');
} finally {
  await connection.end();
}
