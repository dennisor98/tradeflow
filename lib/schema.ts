import { mysqlTable, varchar, decimal, int, bigint, timestamp, text } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('0'),
  accountType: varchar('account_type', { length: 20 }).notNull().default('normal'),
  // Access role. 'admin' unlocks the admin console; 'marketer' is a CRM label
  // for affiliates/promoters. Roles do not affect trade outcomes.
  role: varchar('role', { length: 20 }).notNull().default('user'),
  // scrypt hash, only set for admin accounts. Ordinary users sign in by
  // emailed OTP and keep this null.
  passwordHash: varchar('password_hash', { length: 255 }),
  maxSingleDeposit: decimal('max_single_deposit', { precision: 15, scale: 2 }).notNull().default('0'),
  isActive: int('is_active').notNull().default(0),
  emailVerifiedAt: timestamp('email_verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const userOtps = mysqlTable('user_otps', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  purpose: varchar('purpose', { length: 20 }).notNull(), // register, login
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const trades = mysqlTable('trades', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  asset: varchar('asset', { length: 50 }).notNull(),
  direction: varchar('direction', { length: 10 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  entryPrice: decimal('entry_price', { precision: 15, scale: 6 }).notNull(),
  targetPrice: decimal('target_price', { precision: 15, scale: 6 }).notNull(),
  duration: int('duration').notNull(),
  result: varchar('result', { length: 10 }),
  payout: decimal('payout', { precision: 15, scale: 2 }),
  initialBalance: decimal('initial_balance', { precision: 15, scale: 2 }),
  finalBalance: decimal('final_balance', { precision: 15, scale: 2 }),
  startTime: bigint('start_time', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const transactions = mysqlTable('transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  type: varchar('type', { length: 50 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  time: bigint('time', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const mpesaTransactions = mysqlTable('mpesa_transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  checkoutRequestID: varchar('checkout_request_id', { length: 100 }).notNull(),
  merchantRequestID: varchar('merchant_request_id', { length: 100 }),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // pending, completed, failed
  resultCode: varchar('result_code', { length: 10 }),
  resultDesc: varchar('result_desc', { length: 255 }),
  mpesaReceiptNumber: varchar('mpesa_receipt_number', { length: 50 }),
  transactionDate: varchar('transaction_date', { length: 20 }),
  // The USD/KES rate in force when this push was created. Locked onto the row
  // so a later admin change cannot credit a customer at a different rate than
  // the one they were charged at.
  usdToKesRate: decimal('usd_to_kes_rate', { precision: 12, scale: 4 }),
  // Throttles how often we ask Safaricom about a still-pending push, since the
  // client polls far faster than Daraja wants to be queried.
  lastQueriedAt: timestamp('last_queried_at'),
  queryCount: int('query_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const adminAuditLog = mysqlTable('admin_audit_log', {
  id: varchar('id', { length: 36 }).primaryKey(),
  adminId: varchar('admin_id', { length: 36 }).notNull(),
  adminEmail: varchar('admin_email', { length: 255 }).notNull(),
  action: varchar('action', { length: 60 }).notNull(),
  targetUserId: varchar('target_user_id', { length: 36 }),
  targetUserEmail: varchar('target_user_email', { length: 255 }),
  details: text('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const platformSettings = mysqlTable('platform_settings', {
  key: varchar('setting_key', { length: 64 }).primaryKey(),
  value: varchar('setting_value', { length: 255 }).notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});
