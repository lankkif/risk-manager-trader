// src/constants/ruleBreaks.ts
//
// Single source of truth for rule-break codes stored in DB.
// Stored format today is CSV in fields like: "PLAN_MISSING,OVERRIDE_USED"
//
// Goal: keep codes stable + consistent across the whole app.

export type RuleBreakCode =
  | "PLAN_MISSING"
  | "CLOSEOUT_MISSING"
  | "MAX_TRADES_HIT"
  | "MAX_DAILY_LOSS_HIT"
  | "CONSEC_LOSSES_HIT"
  | "OVERRIDE_USED"
  | "TRADE_BLOCKED_GATE"
  | "INVALID_RISK_INPUT"
  | "OTHER";

export const RULE_BREAK_LABELS: Record<RuleBreakCode, string> = {
  PLAN_MISSING: "Daily plan missing",
  CLOSEOUT_MISSING: "Daily closeout missing",
  MAX_TRADES_HIT: "Max trades hit",
  MAX_DAILY_LOSS_HIT: "Max daily loss hit",
  CONSEC_LOSSES_HIT: "Consecutive losses hit",
  OVERRIDE_USED: "Override used",
  TRADE_BLOCKED_GATE: "Trade blocked by gate",
  INVALID_RISK_INPUT: "Invalid risk input",
  OTHER: "Other",
};

// Backwards-compatible: if DB contains old/unknown codes, map them safely.
const NORMALIZE_MAP: Record<string, RuleBreakCode> = {
  // Common variants
  PLAN_MISS: "PLAN_MISSING",
  PLAN_REQUIRED: "PLAN_MISSING",
  CLOSEOUT_REQUIRED: "CLOSEOUT_MISSING",
  DAILY_CLOSEOUT_MISSING: "CLOSEOUT_MISSING",
  MAX_TRADES: "MAX_TRADES_HIT",
  MAX_DAILY_LOSS: "MAX_DAILY_LOSS_HIT",
  CONSECUTIVE_LOSSES: "CONSEC_LOSSES_HIT",
  OVERRIDE: "OVERRIDE_USED",
  OVERRIDE_ACTIVE: "OVERRIDE_USED",
};

export function normalizeRuleBreak(codeRaw: string): RuleBreakCode {
  const c = (codeRaw || "").trim();
  if (!c) return "OTHER";

  const up = c.toUpperCase();

  // Direct match
  if ((RULE_BREAK_LABELS as any)[up]) return up as RuleBreakCode;

  // Normalized mapping
  if (NORMALIZE_MAP[up]) return NORMALIZE_MAP[up];

  return "OTHER";
}

export function parseRuleBreaks(csv: string | null | undefined): RuleBreakCode[] {
  if (!csv) return [];
  const parts = csv
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const norm = parts.map(normalizeRuleBreak);

  // De-dupe while preserving order
  const out: RuleBreakCode[] = [];
  const seen = new Set<string>();
  for (const c of norm) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export function formatRuleBreaks(codes: RuleBreakCode[]): string {
  // De-dupe and keep stable order
  const out: RuleBreakCode[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    const n = normalizeRuleBreak(c);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.join(",");
}

export function hasRuleBreak(
  csv: string | null | undefined,
  code: RuleBreakCode
): boolean {
  return parseRuleBreaks(csv).includes(code);
}

export function addRuleBreak(
  csv: string | null | undefined,
  code: RuleBreakCode
): string {
  const list = parseRuleBreaks(csv);
  const n = normalizeRuleBreak(code);
  if (!list.includes(n)) list.push(n);
  return formatRuleBreaks(list);
}

export function removeRuleBreak(
  csv: string | null | undefined,
  code: RuleBreakCode
): string {
  const n = normalizeRuleBreak(code);
  const list = parseRuleBreaks(csv).filter((c) => c !== n);
  return formatRuleBreaks(list);
}

export function ruleBreakLabel(code: RuleBreakCode): string {
  return RULE_BREAK_LABELS[code] ?? "Other";
}
