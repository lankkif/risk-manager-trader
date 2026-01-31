import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { getStrategyStats, getTradeStatsForDay } from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pct(x: number) {
  return `${Math.round((x || 0) * 100)}%`;
}

function pickNum(obj: any, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = obj?.[k];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function shortId(id: string, n = 6) {
  const s = String(id || "");
  return s.length > n ? s.slice(0, n) : s;
}

function strategyLabel(name: string, id: string) {
  const clean = (name || "").trim();
  if (clean) return clean;
  return `Strategy ${shortId(id)}`;
}

export default function DashboardTab() {
  const [loading, setLoading] = useState(true);

  const [todayTrades, setTodayTrades] = useState(0);
  const [todayTotalR, setTodayTotalR] = useState(0);
  const [todayWinRate, setTodayWinRate] = useState(0);

  // from getStrategyStats(): { [strategyId]: { strategyName, tradeCount, winRate, avgR, totalR, ... } }
  const [statsById, setStatsById] = useState<Record<string, any>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const key = todayKey();
      const [todayRaw, stratStats] = await Promise.all([
        getTradeStatsForDay(key),
        getStrategyStats(),
      ]);

      const s: any = todayRaw ?? {};
      const count = pickNum(s, ["tradeCount", "count", "trades", "nTrades"], 0);

      let rTotal = pickNum(
        s,
        ["totalR", "sumR", "netR", "total_r", "rTotal"],
        NaN
      );
      if (!Number.isFinite(rTotal)) {
        const avgR = pickNum(s, ["avgR", "averageR", "meanR"], 0);
        rTotal = avgR * count;
      }

      let wr = pickNum(s, ["winRate", "wr", "win_rate"], NaN);
      if (!Number.isFinite(wr)) {
        const wins = pickNum(s, ["wins", "winCount"], 0);
        wr = count > 0 ? wins / count : 0;
      }

      setTodayTrades(count);
      setTodayTotalR(rTotal);
      setTodayWinRate(wr);

      setStatsById(stratStats ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const ranked = useMemo(() => {
    const rows = Object.entries(statsById).map(([strategyId, st]) => {
      const tradeCount = pickNum(st, ["tradeCount", "count", "trades"], 0);
      const totalR = pickNum(st, ["totalR", "sumR", "netR"], NaN);
      const avgR = pickNum(st, ["avgR", "averageR", "meanR"], NaN);
      const winRate = pickNum(st, ["winRate", "wr"], NaN);

      const strategyName = String(st?.strategyName ?? "");

      return {
        strategyId,
        strategyName,
        displayName: strategyLabel(strategyName, strategyId),
        tradeCount,
        totalR: Number.isFinite(totalR) ? totalR : 0,
        avgR: Number.isFinite(avgR) ? avgR : 0,
        winRate: Number.isFinite(winRate) ? winRate : 0,
      };
    });

    const used = rows.filter((r) => r.tradeCount > 0);
    used.sort((a, b) => b.totalR - a.totalR);
    return used;
  }, [statsById]);

  const top3 = ranked.slice(0, 3);
  const worst3 = [...ranked].sort((a, b) => a.totalR - b.totalR).slice(0, 3);

  const insight = useMemo(() => {
    if (ranked.length < 2)
      return "Log more trades per strategy to unlock insights.";
    const worst = worst3[0];
    if (!worst) return "Log more trades per strategy to unlock insights.";
    return `Focus: your lowest performer is "${worst.displayName}" (Total R ${worst.totalR.toFixed(
      2
    )}). Either improve rules, reduce frequency, or pause it.`;
  }, [ranked, worst3]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 16,
        gap: 12,
        paddingBottom: 160, // ✅ more space so it scrolls past the bottom tabs
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "900" }}>Stats</Text>

      {/* Today Summary */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Today</Text>
        <Text>
          Trades: <Text style={{ fontWeight: "900" }}>{todayTrades}</Text>
        </Text>
        <Text>
          Total R:{" "}
          <Text style={{ fontWeight: "900" }}>{todayTotalR.toFixed(2)}</Text>
        </Text>
        <Text>
          Win rate:{" "}
          <Text style={{ fontWeight: "900" }}>{pct(todayWinRate)}</Text>
        </Text>
      </View>

      {/* Insight */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 6,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Coach Note</Text>
        <Text style={{ color: "#333" }}>{insight}</Text>
      </View>

      {/* Top Strategies */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: "900" }}>Top Strategies</Text>

        {top3.length === 0 ? (
          <Text style={{ color: "#666" }}>
            No strategy stats yet. Log trades using a strategy in “Trade”.
          </Text>
        ) : (
          top3.map((r, i) => (
            <View
              key={`${r.strategyId}-${i}`}
              style={{
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#eee",
                gap: 4,
              }}
            >
              <Text style={{ fontWeight: "900" }}>
                #{i + 1} • {r.displayName}
              </Text>
              <Text style={{ color: "#666" }}>
                Trades: {r.tradeCount} • Win: {pct(r.winRate)} • Avg R:{" "}
                {r.avgR.toFixed(2)} • Total R: {r.totalR.toFixed(2)}
              </Text>
              {!!r.strategyName?.trim() && (
                <Text style={{ color: "#999" }}>ID: {shortId(r.strategyId, 10)}</Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* Worst Strategies */}
      <View style={{ gap: 8, marginTop: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: "900" }}>Needs Work</Text>

        {worst3.length === 0 ? (
          <Text style={{ color: "#666" }}>
            Once you have multiple strategies with logs, we’ll show what’s bleeding.
          </Text>
        ) : (
          worst3.map((r, i) => (
            <View
              key={`${r.strategyId}-w-${i}`}
              style={{
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#eee",
                gap: 4,
              }}
            >
              <Text style={{ fontWeight: "900" }}>{r.displayName}</Text>
              <Text style={{ color: "#666" }}>
                Trades: {r.tradeCount} • Win: {pct(r.winRate)} • Avg R:{" "}
                {r.avgR.toFixed(2)} • Total R: {r.totalR.toFixed(2)}
              </Text>
              {!!r.strategyName?.trim() && (
                <Text style={{ color: "#999" }}>ID: {shortId(r.strategyId, 10)}</Text>
              )}
            </View>
          ))
        )}
      </View>

      <View style={{ height: 1, backgroundColor: "#eee", marginTop: 6 }} />

      <Text style={{ color: "#666" }}>
        {loading ? "Refreshing…" : "Tip: The more you log, the smarter this gets."}
      </Text>
    </ScrollView>
  );
}
