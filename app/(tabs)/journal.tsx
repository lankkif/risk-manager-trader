import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import {
  deleteTrade,
  getRecentTradeDayKeys,
  listStrategies,
  listTrades,
  Strategy,
  TradeRow,
} from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortId(id: string, n = 6) {
  const s = String(id || "");
  return s.length > n ? s.slice(0, n) : s;
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function pct(x: number) {
  return `${Math.round((x || 0) * 100)}%`;
}

function displayStrategyName(t: TradeRow) {
  const name = (t.strategyName || "").trim();
  if (name) return name;
  const id = (t.strategyId || "").trim();
  return id ? `Strategy ${shortId(id)}` : "No Strategy";
}

export default function JournalTab() {
  const [loading, setLoading] = useState(true);

  const [days, setDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey());

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyFilter, setStrategyFilter] = useState<string>(""); // "" = all

  const [trades, setTrades] = useState<TradeRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dayKeys, sList] = await Promise.all([
        getRecentTradeDayKeys(14),
        listStrategies(),
      ]);

      // Always include Today even if you haven't traded yet
      const merged = Array.from(new Set([todayKey(), ...dayKeys]));
      setDays(merged);
      setStrategies(sList);

      // If selected day not in list, snap back to today
      if (!merged.includes(selectedDay)) {
        setSelectedDay(todayKey());
      }

      const t = await listTrades({
        dayKey: selectedDay,
        strategyId: strategyFilter || undefined,
        limit: 300,
      });

      setTrades(t);
    } finally {
      setLoading(false);
    }
  }, [selectedDay, strategyFilter]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const summary = useMemo(() => {
    const count = trades.length;
    let wins = 0;
    let totalR = 0;

    for (const t of trades) {
      const r = typeof t.resultR === "number" ? t.resultR : Number(t.resultR);
      if (Number.isFinite(r)) {
        totalR += r;
        if (r > 0) wins += 1;
      }
    }

    const winRate = count > 0 ? wins / count : 0;
    const avgR = count > 0 ? totalR / count : 0;

    return { count, wins, totalR, winRate, avgR };
  }, [trades]);

  async function confirmDelete(trade: TradeRow) {
    Alert.alert(
      "Delete trade?",
      `This will permanently remove the trade.\n\n${displayStrategyName(
        trade
      )} • ${fmtTime(trade.createdAt)} • R ${trade.resultR.toFixed(2)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTrade(trade.id);
            await refresh();
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
      showsVerticalScrollIndicator
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 26, fontWeight: "900" }}>Journal</Text>
        <Text style={{ color: "#666" }}>
          Trade history + review. This is your “discipline mirror”.
        </Text>
      </View>

      {/* Quick actions */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => router.push("/(tabs)/new-trade")}
          style={{
            backgroundColor: "#111",
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            alignItems: "center",
            flex: 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>Log a Trade</Text>
        </Pressable>

        <Pressable
          onPress={refresh}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "900" }}>{loading ? "…" : "Refresh"}</Text>
        </Pressable>
      </View>

      {/* Day filter */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "900" }}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {days.map((d) => (
              <Chip
                key={d}
                text={d === todayKey() ? `Today (${d})` : d}
                active={selectedDay === d}
                onPress={() => setSelectedDay(d)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Strategy filter */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "900" }}>Strategy</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip
              text="All"
              active={!strategyFilter}
              onPress={() => setStrategyFilter("")}
            />
            {strategies.map((s) => (
              <Chip
                key={s.id}
                text={s.name}
                active={strategyFilter === s.id}
                onPress={() => setStrategyFilter(s.id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Summary */}
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
        <Text style={{ fontWeight: "900" }}>Summary</Text>
        <Text style={{ color: "#333" }}>
          Trades: <Text style={{ fontWeight: "900" }}>{summary.count}</Text> •
          Total R:{" "}
          <Text style={{ fontWeight: "900" }}>{summary.totalR.toFixed(2)}</Text>{" "}
          • Win: <Text style={{ fontWeight: "900" }}>{pct(summary.winRate)}</Text>{" "}
          • Avg R:{" "}
          <Text style={{ fontWeight: "900" }}>{summary.avgR.toFixed(2)}</Text>
        </Text>
        <Text style={{ color: "#666" }}>
          Tip: tap a trade to open its strategy. Long-term we’ll add editing and
          full details.
        </Text>
      </View>

      {/* Trades list */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: "900" }}>Trades</Text>

        {trades.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: "#eee",
              borderRadius: 14,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "900" }}>No trades found</Text>
            <Text style={{ color: "#666" }}>
              Log trades in the Trade tab. Then come back here to review patterns.
            </Text>
          </View>
        ) : (
          trades.map((t) => {
            const name = displayStrategyName(t);
            const r = t.resultR;
            const isWin = r > 0;
            const hasRuleBreak = (t.ruleBreaks || "").trim().length > 0;

            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  if (t.strategyId) router.push(`/strategy/${t.strategyId}`);
                }}
                onLongPress={() => confirmDelete(t)}
                style={{
                  borderWidth: 1,
                  borderColor: "#eee",
                  borderRadius: 14,
                  padding: 12,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontWeight: "900", fontSize: 16 }}>{name}</Text>
                    <Text style={{ color: "#666" }}>
                      {fmtTime(t.createdAt)} • {t.session || "—"} •{" "}
                      {t.timeframe || "—"} • {t.bias || "—"}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontWeight: "900",
                        fontSize: 18,
                        color: isWin ? "#0a7a2f" : "#b00020",
                      }}
                    >
                      {r >= 0 ? "+" : ""}
                      {r.toFixed(2)}R
                    </Text>

                    {hasRuleBreak ? (
                      <Text style={{ color: "#b26a00", fontWeight: "900" }}>
                        ⚠ {t.ruleBreaks}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {t.notes?.trim() ? (
                  <Text style={{ color: "#333" }} numberOfLines={2}>
                    {t.notes.trim()}
                  </Text>
                ) : null}

                <Text style={{ color: "#aaa" }}>
                  Hold to delete • ID {shortId(t.id, 10)}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
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
