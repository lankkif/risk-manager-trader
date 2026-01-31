import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
    getRecentTradeDayKeysForWindow,
    listStrategies,
    listTradesRecent,
    Strategy,
    TradeRow,
} from "~/db/db";

function pct(x: number) {
  return `${Math.round((x || 0) * 100)}%`;
}

function parseCsv(s: string) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function mapPrettyTag(tag: string) {
  const m: Record<string, string> = {
    A_PLUS: "A+ Setup",
    MISTAKE: "Mistake",
    FOMO: "FOMO",
    REVENGE: "Revenge",
  };
  return m[tag] ?? tag;
}

type StatRow = {
  key: string;
  label: string;
  tradeCount: number;
  wins: number;
  totalR: number;
  avgR: number;
  winRate: number;
};

function makeStatRow(key: string, label: string, trades: TradeRow[]): StatRow {
  let wins = 0;
  let totalR = 0;
  for (const t of trades) {
    const r = typeof t.resultR === "number" ? t.resultR : Number(t.resultR);
    if (Number.isFinite(r)) totalR += r;
    if (r > 0) wins += 1;
  }
  const tradeCount = trades.length;
  const avgR = tradeCount ? totalR / tradeCount : 0;
  const winRate = tradeCount ? wins / tradeCount : 0;
  return { key, label, tradeCount, wins, totalR, avgR, winRate };
}

function sortBest(rows: StatRow[]) {
  return [...rows].sort((a, b) => b.totalR - a.totalR);
}

function sortWorst(rows: StatRow[]) {
  return [...rows].sort((a, b) => a.totalR - b.totalR);
}

export default function InsightsScreen() {
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(14);

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [allTrades, setAllTrades] = useState<TradeRow[]>([]);
  const [dayKeys, setDayKeys] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // ✅ Single source of truth for the window (same as Journal)
      const [sList, keys, recentTrades] = await Promise.all([
        listStrategies(),
        getRecentTradeDayKeysForWindow(windowDays),
        listTradesRecent(windowDays, 5000),
      ]);

      setStrategies(sList);
      setDayKeys(keys);
      setAllTrades(recentTrades);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const strategyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strategies) m.set(s.id, s.name);
    return m;
  }, [strategies]);

  const computed = useMemo(() => {
    const totalTrades = allTrades.length;

    let wins = 0;
    let totalR = 0;
    let noRuleBreak = 0;

    const ruleBreakCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    const bySession: Record<string, TradeRow[]> = {};
    const byTimeframe: Record<string, TradeRow[]> = {};
    const byBias: Record<string, TradeRow[]> = {};
    const byStrategy: Record<string, TradeRow[]> = {};

    for (const t of allTrades) {
      const r = typeof t.resultR === "number" ? t.resultR : Number(t.resultR);
      if (Number.isFinite(r)) totalR += r;
      if (r > 0) wins += 1;

      const rb = (t.ruleBreaks || "").trim();
      if (!rb) noRuleBreak += 1;
      for (const x of parseCsv(rb)) {
        ruleBreakCounts[x] = (ruleBreakCounts[x] || 0) + 1;
      }

      for (const x of parseCsv(t.tags || "")) {
        tagCounts[x] = (tagCounts[x] || 0) + 1;
      }

      const session = (t.session || "—").trim() || "—";
      const tf = (t.timeframe || "—").trim() || "—";
      const bias = (t.bias || "—").trim() || "—";

      bySession[session] = bySession[session] || [];
      bySession[session].push(t);

      byTimeframe[tf] = byTimeframe[tf] || [];
      byTimeframe[tf].push(t);

      byBias[bias] = byBias[bias] || [];
      byBias[bias].push(t);

      const sid = (t.strategyId || "").trim() || "—";
      byStrategy[sid] = byStrategy[sid] || [];
      byStrategy[sid].push(t);
    }

    const winRate = totalTrades ? wins / totalTrades : 0;
    const avgR = totalTrades ? totalR / totalTrades : 0;
    const disciplineScore = totalTrades ? noRuleBreak / totalTrades : 1;

    const sessionRows = Object.entries(bySession).map(([k, list]) =>
      makeStatRow(k, k, list)
    );
    const tfRows = Object.entries(byTimeframe).map(([k, list]) =>
      makeStatRow(k, k, list)
    );
    const biasRows = Object.entries(byBias).map(([k, list]) =>
      makeStatRow(k, k, list)
    );
    const stratRows = Object.entries(byStrategy).map(([k, list]) => {
      const label =
        (k !== "—" ? strategyNameById.get(k) : "") ||
        (list.find((t) => (t.strategyName || "").trim())?.strategyName || "") ||
        (k === "—" ? "No Strategy" : `Strategy ${k.slice(0, 6)}`);
      return makeStatRow(k, label, list);
    });

    const bestSessions = sortBest(sessionRows).slice(0, 3);
    const worstSessions = sortWorst(sessionRows).slice(0, 3);

    const bestTF = sortBest(tfRows).slice(0, 3);
    const worstTF = sortWorst(tfRows).slice(0, 3);

    const bestStrat = sortBest(stratRows).slice(0, 3);
    const worstStrat = sortWorst(stratRows).slice(0, 3);

    const topRuleBreaks = Object.entries(ruleBreakCounts)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 6);

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 6);

    // Coach Plan (simple but useful)
    const coach: string[] = [];
    if (totalTrades < 5) {
      coach.push("Log at least 5 trades in this window to unlock stronger insights.");
    } else {
      if (disciplineScore < 0.8) {
        coach.push(
          `Discipline is slipping (${pct(disciplineScore)} clean). Aim 90%+ clean trades (no rule breaks).`
        );
      } else {
        coach.push(`Discipline is solid (${pct(disciplineScore)} clean). Keep it above 90%.`);
      }

      const overrideUsed = ruleBreakCounts["OVERRIDE_USED"] || 0;
      if (overrideUsed > 0) {
        coach.push(`Override used ${overrideUsed}×. Goal: 0. Only emergencies.`);
      }

      const closeoutMissing = ruleBreakCounts["CLOSEOUT_MISSING"] || 0;
      if (closeoutMissing > 0) {
        coach.push(`Closeout missing ${closeoutMissing}×. Do closeout after trading to stay sharp.`);
      }

      const worst = worstSessions[0];
      if (worst && worst.tradeCount >= 3 && worst.totalR < 0) {
        coach.push(
          `Session leak: "${worst.label}" is bleeding (${worst.totalR.toFixed(
            2
          )}R). Reduce size, tighten rules, or avoid it.`
        );
      }

      const wtf = worstTF[0];
      if (wtf && wtf.tradeCount >= 3 && wtf.totalR < 0) {
        coach.push(
          `Timeframe leak: "${wtf.label}" is bleeding (${wtf.totalR.toFixed(
            2
          )}R). Either change execution rules or stop trading it.`
        );
      }

      const mistake = tagCounts["MISTAKE"] || 0;
      const fomo = tagCounts["FOMO"] || 0;
      const revenge = tagCounts["REVENGE"] || 0;

      if (mistake + fomo + revenge > 0) {
        coach.push(
          `Mistake tags found: Mistake ${mistake}× • FOMO ${fomo}× • Revenge ${revenge}×. Focus ONE fix for the next 10 trades.`
        );
      }
    }

    return {
      totalTrades,
      wins,
      totalR,
      winRate,
      avgR,
      disciplineScore,
      topRuleBreaks,
      topTags,
      bestSessions,
      worstSessions,
      bestTF,
      worstTF,
      bestStrat,
      worstStrat,
      biasRows: sortBest(biasRows),
      coach,
    };
  }, [allTrades, strategyNameById]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 160 }}
      showsVerticalScrollIndicator
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 26, fontWeight: "900" }}>Insights</Text>
        <Text style={{ color: "#666" }}>
          Patterns + coaching from your last {windowDays} days of logs.
        </Text>
      </View>

      {/* Window selector */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip text="7 days" active={windowDays === 7} onPress={() => setWindowDays(7)} />
        <Chip text="14 days" active={windowDays === 14} onPress={() => setWindowDays(14)} />
        <Chip text="30 days" active={windowDays === 30} onPress={() => setWindowDays(30)} />
        <Pressable
          onPress={refresh}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#ddd",
          }}
        >
          <Text style={{ fontWeight: "900" }}>{loading ? "…" : "Refresh"}</Text>
        </Pressable>
      </View>

      {/* Summary */}
      <Card title={`Window Summary (${dayKeys.length} day keys)`}>
        <Text>
          Trades: <Text style={{ fontWeight: "900" }}>{computed.totalTrades}</Text> • Win:{" "}
          <Text style={{ fontWeight: "900" }}>{pct(computed.winRate)}</Text> • Total R:{" "}
          <Text style={{ fontWeight: "900" }}>{computed.totalR.toFixed(2)}</Text> • Avg R:{" "}
          <Text style={{ fontWeight: "900" }}>{computed.avgR.toFixed(2)}</Text>
        </Text>
        <Text style={{ marginTop: 6 }}>
          Discipline Score (no rule breaks):{" "}
          <Text style={{ fontWeight: "900" }}>{pct(computed.disciplineScore)}</Text>
        </Text>
      </Card>

      {/* Coach Plan */}
      <Card title="Coach Plan">
        {computed.coach.length === 0 ? (
          <Text style={{ color: "#666" }}>Log more trades to unlock coaching.</Text>
        ) : (
          computed.coach.map((line, i) => (
            <Text key={i} style={{ marginBottom: i === computed.coach.length - 1 ? 0 : 6 }}>
              • {line}
            </Text>
          ))
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pressable
            onPress={() => router.push("/(tabs)/journal")}
            style={{
              backgroundColor: "#111",
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: "center",
              flex: 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>Open Journal</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(tabs)/closeout")}
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Closeout</Text>
          </Pressable>
        </View>
      </Card>

      {/* Rule breaks */}
      <Card title="Top Rule Breaks">
        {computed.topRuleBreaks.length === 0 ? (
          <Text style={{ color: "#666" }}>No rule breaks logged in this window. ✅</Text>
        ) : (
          computed.topRuleBreaks.map(([k, v]) => (
            <Text key={k}>
              • <Text style={{ fontWeight: "900" }}>{k}</Text> — {v}×
            </Text>
          ))
        )}
      </Card>

      {/* Tags */}
      <Card title="Top Tags">
        {computed.topTags.length === 0 ? (
          <Text style={{ color: "#666" }}>No tags used yet. Add tags in trade details.</Text>
        ) : (
          computed.topTags.map(([k, v]) => (
            <Text key={k}>
              • <Text style={{ fontWeight: "900" }}>{mapPrettyTag(k)}</Text> — {v}×
            </Text>
          ))
        )}
      </Card>

      {/* Sessions */}
      <Card title="Sessions">
        <Text style={{ fontWeight: "900" }}>Best</Text>
        {computed.bestSessions.length === 0 ? (
          <Text style={{ color: "#666" }}>No session data yet.</Text>
        ) : (
          computed.bestSessions.map((r) => (
            <Text key={`bs-${r.key}`}>
              • {r.label}: {r.totalR.toFixed(2)}R (Trades {r.tradeCount}, Win {pct(r.winRate)})
            </Text>
          ))
        )}

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "900" }}>Worst</Text>
        {computed.worstSessions.length === 0 ? null : (
          computed.worstSessions.map((r) => (
            <Text key={`ws-${r.key}`}>
              • {r.label}: {r.totalR.toFixed(2)}R (Trades {r.tradeCount}, Win {pct(r.winRate)})
            </Text>
          ))
        )}
      </Card>

      {/* Timeframes */}
      <Card title="Timeframes">
        <Text style={{ fontWeight: "900" }}>Best</Text>
        {computed.bestTF.length === 0 ? (
          <Text style={{ color: "#666" }}>No timeframe data yet.</Text>
        ) : (
          computed.bestTF.map((r) => (
            <Text key={`btf-${r.key}`}>
              • {r.label}: {r.totalR.toFixed(2)}R (Trades {r.tradeCount}, Win {pct(r.winRate)})
            </Text>
          ))
        )}

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "900" }}>Worst</Text>
        {computed.worstTF.length === 0 ? null : (
          computed.worstTF.map((r) => (
            <Text key={`wtf-${r.key}`}>
              • {r.label}: {r.totalR.toFixed(2)}R (Trades {r.tradeCount}, Win {pct(r.winRate)})
            </Text>
          ))
        )}
      </Card>

      {/* Strategies */}
      <Card title="Strategies">
        <Text style={{ fontWeight: "900" }}>Best</Text>
        {computed.bestStrat.length === 0 ? (
          <Text style={{ color: "#666" }}>No strategy data yet.</Text>
        ) : (
          computed.bestStrat.map((r) => (
            <Text key={`bst-${r.key}`}>
              • {r.label}: {r.totalR.toFixed(2)}R (Trades {r.tradeCount}, Win {pct(r.winRate)})
            </Text>
          ))
        )}

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "900" }}>Worst</Text>
        {computed.worstStrat.length === 0 ? null : (
          computed.worstStrat.map((r) => (
            <Text key={`wst-${r.key}`}>
              • {r.label}: {r.totalR.toFixed(2)}R (Trades {r.tradeCount}, Win {pct(r.winRate)})
            </Text>
          ))
        )}
      </Card>

      <Text style={{ color: "#666" }}>
        {loading
          ? "Refreshing…"
          : "Tip: This becomes powerful once you consistently tag mistakes + follow your plan."}
      </Text>
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 14,
        padding: 12,
        gap: 6,
        backgroundColor: "#fafafa",
      }}
    >
      <Text style={{ fontWeight: "900", fontSize: 16 }}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  text,
  active,
  onPress,
}: {
  text: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "#111" : "#ddd",
        backgroundColor: active ? "#111" : "white",
      }}
    >
      <Text style={{ color: active ? "white" : "#111", fontWeight: "900" }}>
        {text}
      </Text>
    </Pressable>
  );
}
