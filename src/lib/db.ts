import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "nolio.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

declare global {
  var __nolioDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export const db: Database.Database = global.__nolioDb ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  global.__nolioDb = db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('BANK','CREDIT_CARD')),
  payment_keyword TEXT,
  import_config TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE','TRANSFER')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  file_name TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  row_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  import_batch_id TEXT REFERENCES import_batches(id),
  date TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE','TRANSFER')),
  amount INTEGER NOT NULL,
  memo TEXT,
  raw_row TEXT,
  dedupe_hash TEXT NOT NULL,
  is_manual_category INTEGER NOT NULL DEFAULT 0,
  is_manual_name INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, dedupe_hash)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

CREATE TABLE IF NOT EXISTS normalization_rules (
  id TEXT PRIMARY KEY,
  match_type TEXT NOT NULL CHECK(match_type IN ('CONTAINS','REGEX')),
  pattern TEXT NOT NULL,
  replacement TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category_rules (
  id TEXT PRIMARY KEY,
  match_type TEXT NOT NULL CHECK(match_type IN ('CONTAINS','EXACT','REGEX')),
  pattern TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

export function nowIso(): string {
  return new Date().toISOString();
}
