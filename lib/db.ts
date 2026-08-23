import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';

const connection = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'tradeflow',
});

export const db = drizzle(connection);

const IGNORABLE_DDL_ERRORS = new Set([
  'ER_DUP_FIELDNAME',      // column already added by another worker
  'ER_TABLE_EXISTS_ERROR', // table already created by another worker
  'ER_DUP_KEYNAME',
]);

/**
 * Runs a DDL statement, tolerating the case where a concurrent worker applied
 * it first. Under pm2 cluster every instance boots at once and races on the
 * same check-then-alter; without this a loser throws out of migrateDatabase()
 * and silently skips every remaining migration.
 */
async function runDdl(conn: mysql.PoolConnection, sql: string) {
  try {
    await conn.query(sql);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code && IGNORABLE_DDL_ERRORS.has(code)) {
      console.log('DDL already applied by another worker, continuing');
      return;
    }
    throw error;
  }
}

// Migration to add new columns if they don't exist
async function migrateDatabase() {
  try {
    const conn = await connection.getConnection();
    
    // Check if account_type column exists
    const [columns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'account_type'
    `);
    
    if ((columns as any[]).length === 0) {
      console.log('Adding account_type column...');
      await runDdl(conn, `
        ALTER TABLE users 
        ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT 'normal'
      `);
      console.log('account_type column added');
    }
    
    // Check if max_single_deposit column exists
    const [maxDepositColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'max_single_deposit'
    `);
    
    if ((maxDepositColumns as any[]).length === 0) {
      console.log('Adding max_single_deposit column...');
      await runDdl(conn, `
        ALTER TABLE users 
        ADD COLUMN max_single_deposit DECIMAL(15, 2) NOT NULL DEFAULT '0'
      `);
      console.log('max_single_deposit column added');
    }

    // Check if is_active column exists
    const [isActiveColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'is_active'
    `);

    if ((isActiveColumns as any[]).length === 0) {
      console.log('Adding is_active column...');
      await runDdl(conn, `
        ALTER TABLE users 
        ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0
      `);
      console.log('is_active column added');
    }

    // Check if email_verified_at column exists
    const [emailVerifiedAtColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'email_verified_at'
    `);

    if ((emailVerifiedAtColumns as any[]).length === 0) {
      console.log('Adding email_verified_at column...');
      await runDdl(conn, `
        ALTER TABLE users 
        ADD COLUMN email_verified_at TIMESTAMP NULL
      `);
      console.log('email_verified_at column added');
    }
    
    // Check if initial_balance column exists in trades table
    const [initialBalanceColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'trades' 
      AND COLUMN_NAME = 'initial_balance'
    `);
    
    if ((initialBalanceColumns as any[]).length === 0) {
      console.log('Adding initial_balance column to trades...');
      await runDdl(conn, `
        ALTER TABLE trades 
        ADD COLUMN initial_balance DECIMAL(15, 2) DEFAULT NULL
      `);
      console.log('initial_balance column added to trades');
    }
    
    // Check if final_balance column exists in trades table
    const [finalBalanceColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'trades' 
      AND COLUMN_NAME = 'final_balance'
    `);
    
    if ((finalBalanceColumns as any[]).length === 0) {
      console.log('Adding final_balance column to trades...');
      await runDdl(conn, `
        ALTER TABLE trades 
        ADD COLUMN final_balance DECIMAL(15, 2) DEFAULT NULL
      `);
      console.log('final_balance column added to trades');
    }

    // Check if user_otps table exists
    const [otpTables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'user_otps'
    `);

    if ((otpTables as any[]).length === 0) {
      console.log('Creating user_otps table...');
      await runDdl(conn, `
        CREATE TABLE user_otps (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          purpose VARCHAR(20) NOT NULL,
          code_hash VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_purpose_created_at (user_id, purpose, created_at),
          INDEX idx_expires_at (expires_at)
        )
      `);
      console.log('user_otps table created');
    }
    
    // Check if role column exists
    const [roleColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'role'
    `);

    if ((roleColumns as unknown[]).length === 0) {
      console.log('Adding role column...');
      await runDdl(conn, `
        ALTER TABLE users 
        ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'
      `);
      console.log('role column added');
    }

    // Check if password_hash column exists
    const [passwordColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'password_hash'
    `);

    if ((passwordColumns as unknown[]).length === 0) {
      console.log('Adding password_hash column...');
      await runDdl(conn, `
        ALTER TABLE users 
        ADD COLUMN password_hash VARCHAR(255) NULL
      `);
      console.log('password_hash column added');
    }

    // Check if mpesa_transactions polling columns exist
    const [pollColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'mpesa_transactions' 
      AND COLUMN_NAME = 'last_queried_at'
    `);

    if ((pollColumns as unknown[]).length === 0) {
      console.log('Adding mpesa_transactions polling columns...');
      await runDdl(conn, `
        ALTER TABLE mpesa_transactions 
        ADD COLUMN last_queried_at TIMESTAMP NULL,
        ADD COLUMN query_count INT NOT NULL DEFAULT 0
      `);
      console.log('mpesa_transactions polling columns added');
    }

    // Check if mpesa_transactions rate column exists
    const [rateColumns] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'mpesa_transactions' 
      AND COLUMN_NAME = 'usd_to_kes_rate'
    `);

    if ((rateColumns as unknown[]).length === 0) {
      console.log('Adding mpesa_transactions.usd_to_kes_rate...');
      await runDdl(conn, `
        ALTER TABLE mpesa_transactions 
        ADD COLUMN usd_to_kes_rate DECIMAL(12,4) NULL
      `);
      console.log('usd_to_kes_rate column added');
    }

    // Check if platform_settings table exists
    const [settingsTables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'platform_settings'
    `);

    if ((settingsTables as unknown[]).length === 0) {
      console.log('Creating platform_settings table...');
      await runDdl(conn, `
        CREATE TABLE platform_settings (
          setting_key VARCHAR(64) PRIMARY KEY,
          setting_value VARCHAR(255) NOT NULL,
          updated_by VARCHAR(255),
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('platform_settings table created');
    }

    // Check if admin_audit_log table exists
    const [auditTables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'admin_audit_log'
    `);

    if ((auditTables as unknown[]).length === 0) {
      console.log('Creating admin_audit_log table...');
      await runDdl(conn, `
        CREATE TABLE admin_audit_log (
          id VARCHAR(36) PRIMARY KEY,
          admin_id VARCHAR(36) NOT NULL,
          admin_email VARCHAR(255) NOT NULL,
          action VARCHAR(60) NOT NULL,
          target_user_id VARCHAR(36),
          target_user_email VARCHAR(255),
          details TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_created_at (created_at),
          INDEX idx_target_user (target_user_id)
        )
      `);
      console.log('admin_audit_log table created');
    }

    // Check if mpesa_transactions table exists
    const [mpesaTables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'mpesa_transactions'
    `);
    
    if ((mpesaTables as any[]).length === 0) {
      console.log('Creating mpesa_transactions table...');
      await runDdl(conn, `
        CREATE TABLE mpesa_transactions (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          checkout_request_id VARCHAR(100) NOT NULL,
          merchant_request_id VARCHAR(100),
          amount DECIMAL(15, 2) NOT NULL,
          phone_number VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          result_code VARCHAR(10),
          result_desc VARCHAR(255),
          mpesa_receipt_number VARCHAR(50),
          transaction_date VARCHAR(20),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
      console.log('mpesa_transactions table created');
    }
    
    conn.release();
  } catch (error) {
    console.error('Migration error:', error);
  }
}

/**
 * Creates the administrator described by ADMIN_EMAIL / ADMIN_PASSWORD at boot
 * if it does not already exist.
 *
 * .env stays authoritative for this account: if ADMIN_PASSWORD is changed the
 * stored hash is re-synced on the next boot, so the file and the login always
 * agree. Runs after migrateDatabase() because it depends on the role and
 * password_hash columns existing.
 */
type AdminRow = { id: string; role: string; is_active: number; password_hash: string | null };

async function ensureConfiguredAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn('Admin bootstrap skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create one.');
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `Admin bootstrap refused: ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters. No admin was created.`
    );
    return;
  }

  const conn = await connection.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT id, role, is_active, password_hash FROM users WHERE email = ?',
      [email]
    );
    const existing = (rows as AdminRow[])[0];

    if (!existing) {
      await conn.query(
        `INSERT INTO users (id, name, phone, email, balance, account_type, role, password_hash, is_active, email_verified_at)
         VALUES (?, ?, ?, ?, '0', 'normal', 'admin', ?, 1, NOW())`,
        [
          crypto.randomUUID(),
          process.env.ADMIN_NAME?.trim() || 'Administrator',
          process.env.ADMIN_PHONE?.trim() || `admin-${email}`,
          email,
          await hashPassword(password),
        ]
      );
      console.log(`Admin account created for ${email}`);
      return;
    }

    // Bring an existing row up to date without clobbering anything unrelated.
    const updates: string[] = [];
    const values: unknown[] = [];

    if (existing.role !== 'admin') {
      updates.push('role = ?');
      values.push('admin');
    }
    if (existing.is_active !== 1) {
      updates.push('is_active = ?');
      values.push(1);
    }
    if (!(await verifyPassword(password, existing.password_hash))) {
      updates.push('password_hash = ?');
      values.push(await hashPassword(password));
    }

    if (updates.length > 0) {
      values.push(existing.id);
      await conn.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      console.log(`Admin account for ${email} synced from .env (${updates.length} field(s) updated)`);
    }
  } catch (error) {
    // Under pm2 cluster every worker boots at once; whichever loses the race
    // hits the unique index on email, which is harmless.
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      console.log('Admin account already created by another worker');
      return;
    }
    console.error('Admin bootstrap failed:', error);
  } finally {
    conn.release();
  }
}

// Run migration, then admin bootstrap, on startup
migrateDatabase().then(ensureConfiguredAdmin);
