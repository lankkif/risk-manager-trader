import { openDatabaseSync, SQLiteDatabase } from "expo-sqlite";
import { formatRuleBreaks, parseRuleBreaks } from "../constants/ruleBreaks";
import { DB_NAME, SQL_CREATE_TABLES } from "./schema";

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) db = openDatabaseSync(DB_NAME);
  return db;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureTradesHasTagsColumn(database: SQLiteDatabase) {
  // ✅ Safe migration for existing installs
  const cols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(trades);"
  );
  const hasTags = cols.some((c) => c.name === "tags");
  if (!hasTags) {
    await database.runAsync("ALTER TABLE trades ADD COLUMN tags TEXT;");
  }
}

export async function initDb(): Promise<void> {
  const database = getDb();
  await database.execAsync(SQL_CREATE_TABLES);

  // ✅ migrate existing DBs to include tags column
  await ensureTradesHasTagsColumn(database);

  // ✅ Backfill strategy_name for older trades where it's missing
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

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWindowMs(windowDays: number) {
  const days = Math.max(1, Math.floor(windowDays || 1));
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1)); // include today
  return d.getTime();
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

export type DailyPlanRow = {
  dayKey: string;
  createdAt: number;
  bias: string;
  newsCaution: boolean;
  keyLevels: string;
  scenarios: string;
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

export async function getDailyPlan(dayKey: string): Promise<DailyPlanRow | null> {
  const database = getDb();

  const row = await database.getFirstAsync<{
    day_key: string;
    created_at: number;
    bias: string | null;
    news_caution: number | null;
    key_levels: string | null;
    scenarios: string | null;
  }>(
    `
    SELECT
      day_key,
      created_at,
      bias,
      news_caution,
      key_levels,
      scenarios
    FROM daily_plan
    WHERE day_key = ?
    LIMIT 1;
    `,
    [dayKey]
  );

  if (!row) return null;

  return {
    dayKey: row.day_key,
    createdAt: row.created_at,
    bias: row.bias ?? "",
    newsCaution: (row.news_caution ?? 0) === 1,
    keyLevels: row.key_levels ?? "",
    scenarios: row.scenarios ?? "",
  };
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

export type DailyCloseoutRow = {
  dayKey: string;
  createdAt: number;
  bias: string;
  newsCaution: boolean;
  mood: number;
  mistakes: string;
  wins: string;
  improvement: string;
  executionGrade: string;
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

export async function getDailyCloseout(
  dayKey: string
): Promise<DailyCloseoutRow | null> {
  const database = getDb();

  const row = await database.getFirstAsync<{
    day_key: string;
    created_at: number;
    bias: string | null;
    news_caution: number | null;
    mood: number | null;
    mistakes: string | null;
    wins: string | null;
    improvement: string | null;
    execution_grade: string | null;
  }>(
    `
    SELECT
      day_key,
      created_at,
      bias,
      news_caution,
      mood,
      mistakes,
      wins,
      improvement,
      execution_grade
    FROM daily_closeout
    WHERE day_key = ?
    LIMIT 1;
    `,
    [dayKey]
  );

  if (!row) return null;

  return {
    dayKey: row.day_key,
    createdAt: row.created_at,
    bias: row.bias ?? "",
    newsCaution: (row.news_caution ?? 0) === 1,
    mood: typeof row.mood === "number" ? row.mood : 0,
    mistakes: row.mistakes ?? "",
    wins: row.wins ?? "",
    improvement: row.improvement ?? "",
    executionGrade: row.execution_grade ?? "",
  };
}

/** ---------------- Strategies ---------------- **/
export type StrategyMarket = "gold" | "us30" | "both";

export type Strategy = {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  market: StrategyMarket;
  styleTags: string;
  timeframes: string;
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
  const createdAt = input.id ? now : now;

  await database.runAsync(
    `INSERT OR REPLACE INTO strategies
      (id, created_at, updated_at, name, market, style_tags, timeframes, description, checklist, image_url)
     VALUES (?, COALESCE((SELECT created_at FROM strategies WHERE id=?), ?), ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      id,
      createdAt,
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
  winRate: number;
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
  tags?: string;
};

export async function insertTrade(t: TradeInsert) {
  const database = getDb();
  const id = makeId();
  const createdAt = Date.now();

  await database.runAsync(
    `INSERT INTO trades
      (id, created_at, strategy_id, strategy_name, bias, session, timeframe, risk_r, result_r, rule_breaks, tags, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      // ✅ normalize rule breaks before saving
      t.ruleBreaks ? formatRuleBreaks(parseRuleBreaks(t.ruleBreaks)) : "",
      t.tags ?? "",
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
  tags: string;
  notes: string;
};

export type ListTradesParams = {
  dayKey?: string;
  strategyId?: string;
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
      COALESCE(tags, '') AS tags,
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
    tags: string;
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
    ruleBreaks: formatRuleBreaks(parseRuleBreaks(r.rule_breaks ?? "")),
    tags: r.tags ?? "",
    notes: r.notes ?? "",
  }));
}

/**
 * ✅ REQUIRED by Journal/Insights
 * Windowed list (7/14/30 days etc).
 */
export async function listTradesRecent(
  windowDays: number = 14,
  limit: number = 700
): Promise<TradeRow[]> {
  const database = getDb();

  const startMs = startOfWindowMs(windowDays);
  const nowMs = Date.now();
  const safeLimit = Math.max(1, Math.floor(limit || 1));

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
    tags: string;
    notes: string;
  }>(
    `
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
      COALESCE(tags, '') AS tags,
      COALESCE(notes, '') AS notes
    FROM trades
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ?;
    `,
    [startMs, nowMs, safeLimit]
  );

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
    ruleBreaks: formatRuleBreaks(parseRuleBreaks(r.rule_breaks ?? "")),
    tags: r.tags ?? "",
    notes: r.notes ?? "",
  }));
}

export async function getTradeById(tradeId: string): Promise<TradeRow | null> {
  const database = getDb();

  const row = await database.getFirstAsync<{
    id: string;
    created_at: number;
    strategy_id: string | null;
    strategy_name: string | null;
    bias: string | null;
    session: string | null;
    timeframe: string | null;
    risk_r: number | null;
    result_r: number;
    rule_breaks: string | null;
    tags: string | null;
    notes: string | null;
  }>(
    `
    SELECT
      id,
      created_at,
      strategy_id,
      strategy_name,
      bias,
      session,
      timeframe,
      risk_r,
      result_r,
      rule_breaks,
      tags,
      notes
    FROM trades
    WHERE id = ?
    LIMIT 1;
    `,
    [tradeId]
  );

  if (!row) return null;

  return {
    id: row.id,
    createdAt: row.created_at,
    strategyId: row.strategy_id ?? "",
    strategyName: row.strategy_name ?? "",
    bias: row.bias ?? "",
    session: row.session ?? "",
    timeframe: row.timeframe ?? "",
    riskR: typeof row.risk_r === "number" ? row.risk_r : null,
    resultR: typeof row.result_r === "number" ? row.result_r : Number(row.result_r),
    ruleBreaks: formatRuleBreaks(parseRuleBreaks(row.rule_breaks ?? "")),
    tags: row.tags ?? "",
    notes: row.notes ?? "",
  };
}

export async function deleteTrade(tradeId: string): Promise<void> {
  const database = getDb();
  await database.runAsync("DELETE FROM trades WHERE id = ?;", [tradeId]);
}

export async function updateTradeTags(
  tradeId: string,
  tags: string
): Promise<void> {
  const database = getDb();
  await database.runAsync("UPDATE trades SET tags = ? WHERE id = ?;", [
    tags ?? "",
    tradeId,
  ]);
}

export async function updateTradeNotes(
  tradeId: string,
  notes: string
): Promise<void> {
  const database = getDb();
  await database.runAsync("UPDATE trades SET notes = ? WHERE id = ?;", [
    notes ?? "",
    tradeId,
  ]);
}

/** ---------------- Dashboard / Insights ---------------- **/
export type DashboardSummary = {
  todayTrades: number;
  todayNetR: number;
  todayWinRate: number;
  totalTrades: number;
  totalNetR: number;
};

export async function getDashboardSummary(
  dayKey: string
): Promise<DashboardSummary> {
  const database = getDb();
  const { startMs, endMs } = getDayStartEndMs(dayKey);

  const today = await database.getFirstAsync<{
    c: number;
    netR: number;
    wins: number;
  }>(
    `
    SELECT
      COUNT(*) AS c,
      COALESCE(SUM(result_r), 0) AS netR,
      COALESCE(SUM(CASE WHEN result_r > 0 THEN 1 ELSE 0 END), 0) AS wins
    FROM trades
    WHERE created_at >= ? AND created_at < ?;
    `,
    [startMs, endMs]
  );

  const all = await database.getFirstAsync<{
    c: number;
    netR: number;
  }>(
    `
    SELECT
      COUNT(*) AS c,
      COALESCE(SUM(result_r), 0) AS netR
    FROM trades;
    `
  );

  const todayTrades = today?.c ?? 0;
  const todayWins = today?.wins ?? 0;

  return {
    todayTrades,
    todayNetR: today?.netR ?? 0,
    todayWinRate: todayTrades ? todayWins / todayTrades : 0,
    totalTrades: all?.c ?? 0,
    totalNetR: all?.netR ?? 0,
  };
}

/**
 * ✅ REQUIRED by Dashboard + Gate
 * Provides a stable daily stats object.
 */
export type TradeStatsForDay = {
  dayKey: string;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  avgR: number;
};

export async function getTradeStatsForDay(
  dayKey: string
): Promise<TradeStatsForDay> {
  const database = getDb();
  const { startMs, endMs } = getDayStartEndMs(dayKey);

  const row = await database.getFirstAsync<{
    c: number;
    wins: number;
    losses: number;
    totalR: number;
    avgR: number;
  }>(
    `
    SELECT
      COUNT(*) AS c,
      COALESCE(SUM(CASE WHEN result_r > 0 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN result_r < 0 THEN 1 ELSE 0 END), 0) AS losses,
      COALESCE(SUM(result_r), 0) AS totalR,
      COALESCE(AVG(result_r), 0) AS avgR
    FROM trades
    WHERE created_at >= ? AND created_at < ?;
    `,
    [startMs, endMs]
  );

  const tradeCount = row?.c ?? 0;
  const wins = row?.wins ?? 0;
  const losses = row?.losses ?? 0;
  const totalR = row?.totalR ?? 0;
  const avgR = row?.avgR ?? 0;

  return {
    dayKey,
    tradeCount,
    wins,
    losses,
    winRate: tradeCount > 0 ? wins / tradeCount : 0,
    totalR,
    avgR,
  };
}

/** ---------------- Insights helpers ---------------- **/
export type RecentTradeRow = TradeRow;

/**
 * Kept for compatibility: recent trades since start of dayKey.
 * (Not used by Journal, but used in some screens.)
 */
export async function getRecentTrades(
  dayKey: string,
  limit = 25
): Promise<RecentTradeRow[]> {
  const database = getDb();
  const { startMs } = getDayStartEndMs(dayKey);

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
    tags: string;
    notes: string;
  }>(
    `
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
      COALESCE(tags, '') AS tags,
      COALESCE(notes, '') AS notes
    FROM trades
    WHERE created_at >= ?
    ORDER BY created_at DESC
    LIMIT ?;
    `,
    [startMs, limit]
  );

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
    ruleBreaks: formatRuleBreaks(parseRuleBreaks(r.rule_breaks ?? "")),
    tags: r.tags ?? "",
    notes: r.notes ?? "",
  }));
}

/** ---------------- Strategy Detail ---------------- **/
export async function listTradesByStrategy(
  strategyId: string,
  limit = 200
): Promise<TradeRow[]> {
  return listTrades({ strategyId, limit });
}

export type StrategyDetail = {
  strategy: Strategy | null;
  trades: TradeRow[];
};

export async function getStrategyDetail(
  strategyId: string
): Promise<StrategyDetail> {
  const database = getDb();

  const s = await database.getFirstAsync<{
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
  }>(
    `
    SELECT
      id,
      created_at,
      updated_at,
      name,
      market,
      style_tags,
      timeframes,
      description,
      checklist,
      image_url
    FROM strategies
    WHERE id = ?
    LIMIT 1;
    `,
    [strategyId]
  );

  const strategy: Strategy | null = s
    ? {
        id: s.id,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        name: s.name,
        market: (s.market as StrategyMarket) ?? "both",
        styleTags: s.style_tags ?? "",
        timeframes: s.timeframes ?? "",
        description: s.description ?? "",
        checklist: s.checklist ?? "",
        imageUrl: s.image_url ?? "",
      }
    : null;

  const trades = await database.getAllAsync<{
    id: string;
    created_at: number;
    strategy_id: string | null;
    strategy_name: string | null;
    bias: string | null;
    session: string | null;
    timeframe: string | null;
    risk_r: number | null;
    result_r: number;
    rule_breaks: string | null;
    tags: string | null;
    notes: string | null;
  }>(
    `
    SELECT
      id,
      created_at,
      strategy_id,
      strategy_name,
      bias,
      session,
      timeframe,
      risk_r,
      result_r,
      rule_breaks,
      tags,
      notes
    FROM trades
    WHERE strategy_id = ?
    ORDER BY created_at DESC
    LIMIT 200;
    `,
    [strategyId]
  );

  const mapped = trades.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    strategyId: r.strategy_id ?? "",
    strategyName: r.strategy_name ?? "",
    bias: r.bias ?? "",
    session: r.session ?? "",
    timeframe: r.timeframe ?? "",
    riskR: typeof r.risk_r === "number" ? r.risk_r : null,
    resultR: typeof r.result_r === "number" ? r.result_r : Number(r.result_r),
    ruleBreaks: formatRuleBreaks(parseRuleBreaks(r.rule_breaks ?? "")),
    tags: r.tags ?? "",
    notes: r.notes ?? "",
  }));

  return { strategy, trades: mapped };
}
