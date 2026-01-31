import { openDatabaseSync, SQLiteDatabase } from "expo-sqlite";
import { DB_NAME, SQL_CREATE_TABLES } from "./schema";

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) db = openDatabaseSync(DB_NAME);
  return db;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function initDb(): Promise<void> {
  const database = getDb();
  await database.execAsync(SQL_CREATE_TABLES);

  // ✅ Step 13.2: Backfill strategy_name for older trades where it's missing.
  // Keeps dashboards human-friendly even if a strategy is later deleted.
  await database.runAsync(`
    UPDATE trades
    SET strategy_name = (
      SELECT s.name
      FROM strategies s
      WHERE s.id = trades.strategy_id
      LIMIT 1
    )
    WHERE (strategy_name IS NULL OR TRIM(strategy_name) = '')
      AND strategy_id IS NOT NULL
      AND TRIM(strategy_id) <> ''
      AND EXISTS (SELECT 1 FROM strategies s WHERE s.id = trades.strategy_id);
  `);
}

/** ---------------- Helpers ---------------- **/
function getDayStartEndMs(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** ---------------- Settings ---------------- **/
export async function setSetting(key: string, value: string): Promise<void> {
  const database = getDb();
  await database.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);",
    [key, value]
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const database = getDb();
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ? LIMIT 1;",
    [key]
  );
  return row?.value ?? null;
}

/** ---------------- Daily Plan ---------------- **/
export type DailyPlanInput = {
  bias?: string;
  newsCaution?: boolean;
  keyLevels?: string;
  scenarios?: string;
};

export async function upsertDailyPlan(dayKey: string, input: DailyPlanInput) {
  const database = getDb();
  const createdAt = Date.now();

  await database.runAsync(
    `INSERT OR REPLACE INTO daily_plan
      (day_key, created_at, bias, news_caution, key_levels, scenarios)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      dayKey,
      createdAt,
      input.bias ?? "",
      input.newsCaution ? 1 : 0,
      input.keyLevels ?? "",
      input.scenarios ?? "",
    ]
  );
}

export async function hasDailyPlan(dayKey: string): Promise<boolean> {
  const database = getDb();
  const row = await database.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM daily_plan WHERE day_key = ?;",
    [dayKey]
  );
  return (row?.c ?? 0) > 0;
}

/** ---------------- Daily Closeout ---------------- **/
export type DailyCloseoutInput = {
  bias?: string;
  newsCaution?: boolean;
  mood?: number;
  mistakes?: string;
  wins?: string;
  improvement?: string;
  executionGrade?: string;
};

export async function upsertDailyCloseout(
  dayKey: string,
  input: DailyCloseoutInput
) {
  const database = getDb();
  const createdAt = Date.now();

  await database.runAsync(
    `INSERT OR REPLACE INTO daily_closeout
      (day_key, created_at, bias, news_caution, mood, mistakes, wins, improvement, execution_grade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      dayKey,
      createdAt,
      input.bias ?? "",
      input.newsCaution ? 1 : 0,
      typeof input.mood === "number" ? input.mood : 0,
      input.mistakes ?? "",
      input.wins ?? "",
      input.improvement ?? "",
      input.executionGrade ?? "",
    ]
  );
}

export async function hasDailyCloseout(dayKey: string): Promise<boolean> {
  const database = getDb();
  const row = await database.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM daily_closeout WHERE day_key = ?;",
    [dayKey]
  );
  return (row?.c ?? 0) > 0;
}

/** ---------------- Strategies ---------------- **/
export type StrategyMarket = "gold" | "us30" | "both";

export type Strategy = {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  market: StrategyMarket;
  styleTags: string; // "scalp,intraday"
  timeframes: string; // "M5,M15,H1"
  description: string;
  checklist: string;
  imageUrl: string;
};

export type StrategyUpsertInput = {
  id?: string;
  name: string;
  market: StrategyMarket;
  styleTags?: string;
  timeframes?: string;
  description?: string;
  checklist?: string;
  imageUrl?: string;
};

export async function upsertStrategy(input: StrategyUpsertInput): Promise<string> {
  const database = getDb();
  const now = Date.now();

  const id = input.id ?? makeId();
  const createdAtFallback = now;

  await database.runAsync(
    `INSERT OR REPLACE INTO strategies
      (id, created_at, updated_at, name, market, style_tags, timeframes, description, checklist, image_url)
     VALUES (?, COALESCE((SELECT created_at FROM strategies WHERE id=?), ?), ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      id,
      createdAtFallback,
      now,
      input.name.trim(),
      input.market,
      (input.styleTags ?? "").trim(),
      (input.timeframes ?? "").trim(),
      (input.description ?? "").trim(),
      (input.checklist ?? "").trim(),
      (input.imageUrl ?? "").trim(),
    ]
  );

  return id;
}

export async function listStrategies(): Promise<Strategy[]> {
  const database = getDb();

  const rows = await database.getAllAsync<{
    id: string;
    created_at: number;
    updated_at: number;
    name: string;
    market: string;
    style_tags: string;
    timeframes: string;
    description: string;
    checklist: string;
    image_url: string;
  }>(`SELECT * FROM strategies ORDER BY updated_at DESC;`);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    name: r.name,
    market: (r.market as StrategyMarket) ?? "both",
    styleTags: r.style_tags ?? "",
    timeframes: r.timeframes ?? "",
    description: r.description ?? "",
    checklist: r.checklist ?? "",
    imageUrl: r.image_url ?? "",
  }));
}

export async function deleteStrategy(id: string): Promise<void> {
  const database = getDb();
  await database.runAsync("DELETE FROM strategies WHERE id = ?;", [id]);
}

export type StrategyStats = {
  strategyId: string;
  strategyName: string;
  tradeCount: number;
  winRate: number; // 0..1
  avgR: number;
  totalR: number;
};

export async function getStrategyStats(): Promise<Record<string, StrategyStats>> {
  const database = getDb();

  const rows = await database.getAllAsync<{
    strategy_id: string;
    strategy_name: string;
    c: number;
    wins: number;
    avgR: number;
    totalR: number;
  }>(`
    SELECT
      COALESCE(t.strategy_id, '') AS strategy_id,
      COALESCE(
        MAX(s.name),
        MAX(NULLIF(t.strategy_name, '')),
        COALESCE(t.strategy_id, '')
      ) AS strategy_name,
      COUNT(*) AS c,
      SUM(CASE WHEN t.result_r > 0 THEN 1 ELSE 0 END) AS wins,
      AVG(t.result_r) AS avgR,
      SUM(t.result_r) AS totalR
    FROM trades t
    LEFT JOIN strategies s ON s.id = t.strategy_id
    WHERE COALESCE(t.strategy_id, '') <> ''
    GROUP BY t.strategy_id;
  `);

  const out: Record<string, StrategyStats> = {};
  for (const r of rows) {
    out[r.strategy_id] = {
      strategyId: r.strategy_id,
      strategyName: r.strategy_name ?? r.strategy_id,
      tradeCount: r.c ?? 0,
      winRate: r.c ? (r.wins ?? 0) / r.c : 0,
      avgR: r.avgR ?? 0,
      totalR: r.totalR ?? 0,
    };
  }
  return out;
}

/** ---------------- Trades ---------------- **/
export type TradeInsert = {
  resultR: number;
  riskR?: number;
  notes?: string;
  bias?: string;
  session?: string;
  timeframe?: string;
  strategyId?: string;
  strategyName?: string;
  ruleBreaks?: string;
};

export async function insertTrade(t: TradeInsert) {
  const database = getDb();
  const id = makeId();
  const createdAt = Date.now();

  await database.runAsync(
    `INSERT INTO trades
      (id, created_at, strategy_id, strategy_name, bias, session, timeframe, risk_r, result_r, rule_breaks, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      createdAt,
      t.strategyId ?? "",
      t.strategyName ?? "",
      t.bias ?? "",
      t.session ?? "",
      t.timeframe ?? "",
      typeof t.riskR === "number" ? t.riskR : null,
      t.resultR,
      t.ruleBreaks ?? "",
      t.notes ?? "",
    ]
  );
}

export type TradeRow = {
  id: string;
  createdAt: number;
  strategyId: string;
  strategyName: string;
  bias: string;
  session: string;
  timeframe: string;
  riskR: number | null;
  resultR: number;
  ruleBreaks: string;
  notes: string;
};

export type ListTradesParams = {
  dayKey?: string; // "YYYY-MM-DD"
  strategyId?: string; // exact strategy_id
  limit?: number;
  offset?: number;
};

export async function listTrades(params: ListTradesParams): Promise<TradeRow[]> {
  const database = getDb();

  const where: string[] = [];
  const args: (string | number)[] = [];

  if (params.dayKey) {
    const { startMs, endMs } = getDayStartEndMs(params.dayKey);
    where.push("created_at >= ? AND created_at < ?");
    args.push(startMs, endMs);
  }

  if (params.strategyId && params.strategyId.trim() !== "") {
    where.push("strategy_id = ?");
    args.push(params.strategyId.trim());
  }

  const limit = typeof params.limit === "number" ? params.limit : 200;
  const offset = typeof params.offset === "number" ? params.offset : 0;

  const sql = `
    SELECT
      id,
      created_at,
      COALESCE(strategy_id, '') AS strategy_id,
      COALESCE(strategy_name, '') AS strategy_name,
      COALESCE(bias, '') AS bias,
      COALESCE(session, '') AS session,
      COALESCE(timeframe, '') AS timeframe,
      risk_r,
      result_r,
      COALESCE(rule_breaks, '') AS rule_breaks,
      COALESCE(notes, '') AS notes
    FROM trades
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?;
  `;

  const rows = await database.getAllAsync<{
    id: string;
    created_at: number;
    strategy_id: string;
    strategy_name: string;
    bias: string;
    session: string;
    timeframe: string;
    risk_r: number | null;
    result_r: number;
    rule_breaks: string;
    notes: string;
  }>(sql, [...args, limit, offset]);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    strategyId: r.strategy_id ?? "",
    strategyName: r.strategy_name ?? "",
    bias: r.bias ?? "",
    session: r.session ?? "",
    timeframe: r.timeframe ?? "",
    riskR: typeof r.risk_r === "number" ? r.risk_r : null,
    resultR: typeof r.result_r === "number" ? r.result_r : Number(r.result_r),
    ruleBreaks: r.rule_breaks ?? "",
    notes: r.notes ?? "",
  }));
}

export async function deleteTrade(tradeId: string): Promise<void> {
  const database = getDb();
  await database.runAsync("DELETE FROM trades WHERE id = ?;", [tradeId]);
}

/**
 * Returns recent trade day keys like ["2026-01-31", "2026-01-30", ...]
 * Uses device local time (important for your daily discipline workflow).
 */
export async function getRecentTradeDayKeys(limit = 14): Promise<string[]> {
  const database = getDb();

  const rows = await database.getAllAsync<{ day_key: string }>(
    `
    SELECT
      strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day_key
    FROM trades
    GROUP BY day_key
    ORDER BY day_key DESC
    LIMIT ?;
    `,
    [limit]
  );

  return rows.map((r) => r.day_key).filter(Boolean);
}

/**
 * Trade stats for a given day (used by Dashboard "Today").
 */
export type TradeStats = {
  tradeCount: number;
  sumR: number;
  consecutiveLosses: number;
  wins: number;
  winRate: number; // 0..1
  avgR: number;
  totalR: number;
};

export async function getTradeStatsForDay(dayKey: string): Promise<TradeStats> {
  const database = getDb();
  const { startMs, endMs } = getDayStartEndMs(dayKey);

  const totals = await database.getFirstAsync<{
    c: number;
    s: number;
    wins: number;
    avgR: number;
  }>(
    `
    SELECT
      COUNT(*) AS c,
      COALESCE(SUM(result_r), 0) AS s,
      COALESCE(SUM(CASE WHEN result_r > 0 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(AVG(result_r), 0) AS avgR
    FROM trades
    WHERE created_at >= ? AND created_at < ?;
    `,
    [startMs, endMs]
  );

  const rows = await database.getAllAsync<{ result_r: number }>(
    `SELECT result_r
     FROM trades
     WHERE created_at >= ? AND created_at < ?
     ORDER BY created_at DESC
     LIMIT 50;`,
    [startMs, endMs]
  );

  let streak = 0;
  for (const r of rows) {
    if (typeof r.result_r === "number" && r.result_r < 0) streak++;
    else break;
  }

  const tradeCount = totals?.c ?? 0;
  const sumR = totals?.s ?? 0;
  const wins = totals?.wins ?? 0;
  const avgR = totals?.avgR ?? 0;
  const winRate = tradeCount > 0 ? wins / tradeCount : 0;

  return {
    tradeCount,
    sumR,
    consecutiveLosses: streak,
    wins,
    winRate,
    avgR,
    totalR: sumR,
  };
}
