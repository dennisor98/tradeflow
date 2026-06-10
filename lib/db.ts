import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'tradeflow',
});

export const db = drizzle(connection);

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
      await conn.query(`
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
      await conn.query(`
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
      await conn.query(`
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
      await conn.query(`
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
      await conn.query(`
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
      await conn.query(`
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
      await conn.query(`
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
    
    // Check if mpesa_transactions table exists
    const [mpesaTables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'mpesa_transactions'
    `);
    
    if ((mpesaTables as any[]).length === 0) {
      console.log('Creating mpesa_transactions table...');
      await conn.query(`
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

// Run migration on startup
migrateDatabase();
