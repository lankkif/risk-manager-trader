export const DB_NAME = "risk_manager_trader.db";

export const SQL_CREATE_TABLES = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

CREATE TABLE IF NOT EXISTS daily_plan (
  day_key TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  bias TEXT,
  news_caution INTEGER DEFAULT 0,
  key_levels TEXT,
  scenarios TEXT
);

CREATE TABLE IF NOT EXISTS daily_closeout (
  day_key TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  bias TEXT,
  news_caution INTEGER DEFAULT 0,
  mood INTEGER DEFAULT 0,
  mistakes TEXT,
  wins TEXT,
  improvement TEXT,
  execution_grade TEXT
);

/* ✅ Strategies (B mode) */
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL,          -- "gold" | "us30" | "both"
  style_tags TEXT,               -- comma separated: "scalp,swing"
  timeframes TEXT,               -- e.g. "M5,M15,H1"
  description TEXT,              -- how to use
  checklist TEXT,                -- rules checklist
  image_url TEXT                 -- optional URL
);

CREATE INDEX IF NOT EXISTS idx_strategies_updated_at ON strategies(updated_at);
CREATE INDEX IF NOT EXISTS idx_strategies_market ON strategies(market);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  strategy_id TEXT,
  strategy_name TEXT,
  bias TEXT,
  session TEXT,
  timeframe TEXT,
  risk_r REAL,
  result_r REAL NOT NULL,
  rule_breaks TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy_id);
`;
