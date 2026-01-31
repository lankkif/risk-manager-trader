import {
  getSetting,
  getTradeStatsForDay,
  hasDailyCloseout,
  hasDailyPlan,
} from "../db/db";

export type GateResult = {
  canTrade: boolean;
  reasons: string[];

  mode: "demo" | "real";
  overrideActive: boolean;
  overrideUntilMs: number;
  overrideCooldownUntilMs: number;

  // ✅ Soft discipline nudges (NO lockout)
  softWarnings: string[];

  requirements: {
    planDone: boolean;
    closeoutDone: boolean;
  };

  stats: {
    tradeCount: number;
    sumR: number;
    consecutiveLosses: number;
  };

  settings: {
    maxTradesPerDay: number;
    maxDailyLossR: number;
    maxConsecutiveLosses: number;
    requireDailyPlan: boolean; // still exists, but treated as SOFT (no lockout)
    requireDailyCloseout: boolean; // SOFT (no lockout)
  };
};

function dayKeyFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayKey() {
  return dayKeyFromDate(new Date());
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKeyFromDate(d);
}

function toBool(v: string | null, fallback: boolean) {
  if (v === null) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function toNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function evaluateGate(): Promise<GateResult> {
  const now = Date.now();

  // Mode + override settings
  const [appModeRaw, overrideUntilRaw, overrideCooldownRaw] = await Promise.all([
    getSetting("appMode"),
    getSetting("gateOverrideUntil"),
    getSetting("gateOverrideCooldownUntil"),
  ]);

  const mode: "demo" | "real" = appModeRaw === "real" ? "real" : "demo";
  const overrideUntilMs = toNum(overrideUntilRaw, 0);
  const overrideCooldownUntilMs = toNum(overrideCooldownRaw, 0);
  const overrideActive = mode === "real" && now < overrideUntilMs;

  // Load rule settings (with defaults)
  const [
    maxTradesPerDayRaw,
    maxDailyLossRRaw,
    maxConsecutiveLossesRaw,
    requireDailyPlanRaw,
    requireDailyCloseoutRaw,
  ] = await Promise.all([
    getSetting("maxTradesPerDay"),
    getSetting("maxDailyLossR"),
    getSetting("maxConsecutiveLosses"),
    getSetting("requireDailyPlan"),
    getSetting("requireDailyCloseout"),
  ]);

  const settings = {
    maxTradesPerDay: toNum(maxTradesPerDayRaw, 3),
    maxDailyLossR: toNum(maxDailyLossRRaw, 2),
    maxConsecutiveLosses: toNum(maxConsecutiveLossesRaw, 2),
    requireDailyPlan: toBool(requireDailyPlanRaw, true),
    requireDailyCloseout: toBool(requireDailyCloseoutRaw, true),
  };

  const todayKey = getTodayKey();
  const yesterdayKey = getYesterdayKey();

  // Always compute stats
  const stats = await getTradeStatsForDay(todayKey);

  // DEMO MODE: bypass gate
  if (mode === "demo") {
    return {
      canTrade: true,
      reasons: [],
      mode,
      overrideActive: false,
      overrideUntilMs: 0,
      overrideCooldownUntilMs,
      softWarnings: [],
      requirements: { planDone: true, closeoutDone: true },
      stats,
      settings,
    };
  }

  // REAL MODE requirements checks
  const [planDone, closeoutDone] = await Promise.all([
    settings.requireDailyPlan ? hasDailyPlan(todayKey) : Promise.resolve(true),
    settings.requireDailyCloseout
      ? hasDailyCloseout(yesterdayKey)
      : Promise.resolve(true),
  ]);

  const reasons: string[] = [];
  const softWarnings: string[] = [];

  // ✅ Daily Plan is now SOFT (no lockout) — user asked to never be blocked
  if (!planDone && settings.requireDailyPlan) {
    softWarnings.push("PLAN_MISSING");
  }

  // ✅ Closeout remains SOFT (no lockout)
  if (!closeoutDone && settings.requireDailyCloseout) {
    softWarnings.push("CLOSEOUT_MISSING");
  }

  // Hard rules (lockout still applies for true risk discipline)
  if (
    settings.maxTradesPerDay > 0 &&
    stats.tradeCount >= settings.maxTradesPerDay
  ) {
    reasons.push(`Max trades hit (${stats.tradeCount}/${settings.maxTradesPerDay}).`);
  }

  if (settings.maxDailyLossR > 0 && stats.sumR <= -settings.maxDailyLossR) {
    reasons.push(
      `Daily loss limit hit (${stats.sumR.toFixed(2)}R ≤ -${settings.maxDailyLossR}R).`
    );
  }

  if (
    settings.maxConsecutiveLosses > 0 &&
    stats.consecutiveLosses >= settings.maxConsecutiveLosses
  ) {
    reasons.push(
      `Consecutive losses limit hit (${stats.consecutiveLosses}/${settings.maxConsecutiveLosses}).`
    );
  }

  const canTrade = overrideActive ? true : reasons.length === 0;

  return {
    canTrade,
    reasons,
    mode,
    overrideActive,
    overrideUntilMs,
    overrideCooldownUntilMs,
    softWarnings,
    requirements: { planDone, closeoutDone },
    stats,
    settings,
  };
}
