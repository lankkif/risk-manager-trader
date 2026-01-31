import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  deleteTrade,
  listStrategies,
  listTradesRecent,
  Strategy,
  TradeRow,
  updateTradeTags,
} from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKeyFromMs(ms: number) {
  const d = new Date(ms);
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

type TagKey = "A_PLUS" | "MISTAKE" | "FOMO" | "REVENGE";

const TAG_OPTIONS: { key: TagKey; label: string }[] = [
  { key: "A_PLUS", label: "A+" },
  { key: "MISTAKE", label: "Mistake" },
  { key: "FOMO", label: "FOMO" },
  { key: "REVENGE", label: "Revenge" },
];

function parseTagsCsv(tags: string): string[] {
  return (tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function toTagsCsv(tags: string[]) {
  // de-dup while preserving order
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.join(",");
}

function niceTags(tags: string) {
  const map: Record<string, string> = {
    A_PLUS: "A+ Setup",
    MISTAKE: "Mistake",
    FOMO: "FOMO",
    REVENGE: "Revenge",
  };

  return parseTagsCsv(tags)
    .map((t) => map[t] ?? t)
    .join(" • ");
}

export default function JournalTab() {
  const [loading, setLoading] = useState(true);

  // ✅ Window: 7/14/30
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(14);

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyFilter, setStrategyFilter] = useState<string>(""); // "" = all

  // ✅ Filters
  const [tagFilter, setTagFilter] = useState<string>(""); // exact: A_PLUS etc (optional)
  const [sessionFilter, setSessionFilter] = useState<string>(""); // contains

  const [trades, setTrades] = useState<TradeRow[]>([]);

  // ✅ quick save feedback for tags
  const [savingTradeId, setSavingTradeId] = useState<string>("");
  const [savedPulse, setSavedPulse] = useState<{ id: string; text: string } | null>(
    null
  );
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sList, tList] = await Promise.all([
        listStrategies(),
        listTradesRecent(windowDays, 700),
      ]);
      setStrategies(sList);
      setTrades(tList);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        if (savedTimer.current) {
          clearTimeout(savedTimer.current);
          savedTimer.current = null;
        }
      };
    }, [refresh])
  );

  const filteredTrades = useMemo(() => {
    const tfSession = sessionFilter.trim().toLowerCase();
    const tfTag = tagFilter.trim().toUpperCase();

    return trades.filter((t) => {
      if (strategyFilter) {
        if ((t.strategyId || "").trim() !== strategyFilter) return false;
      }

      if (tfSession) {
        const s = (t.session || "").toLowerCase();
        if (!s.includes(tfSession)) return false;
      }

      if (tfTag) {
        const tags = parseTagsCsv(t.tags || "").map((x) => x.toUpperCase());
        if (!tags.includes(tfTag)) return false;
      }

      return true;
    });
  }, [trades, strategyFilter, sessionFilter, tagFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, TradeRow[]>();

    for (const t of filteredTrades) {
      const k = dayKeyFromMs(t.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }

    const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({ dayKey: k, trades: map.get(k)! }));
  }, [filteredTrades]);

  const summary = useMemo(() => {
    const count = filteredTrades.length;
    let wins = 0;
    let totalR = 0;

    for (const t of filteredTrades) {
      const r = typeof t.resultR === "number" ? t.resultR : Number(t.resultR);
      if (Number.isFinite(r)) {
        totalR += r;
        if (r > 0) wins += 1;
      }
    }

    const winRate = count > 0 ? wins / count : 0;
    const avgR = count > 0 ? totalR / count : 0;

    return { count, wins, totalR, winRate, avgR };
  }, [filteredTrades]);

  async function confirmDelete(trade: TradeRow) {
    Alert.alert(
      "Delete trade?",
      `This will permanently remove the trade.\n\n${displayStrategyName(
        trade
      )} • ${fmtTime(trade.createdAt)} • ${trade.resultR.toFixed(2)}R`,
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

  async function toggleQuickTag(trade: TradeRow, tag: TagKey) {
    if (savingTradeId) return;

    const current = parseTagsCsv(trade.tags || "").map((t) => t.toUpperCase());
    const exists = current.includes(tag);
    const next = exists ? current.filter((t) => t !== tag) : [...current, tag];

    const nextCsv = toTagsCsv(next);

    // optimistic UI update
    setSavingTradeId(trade.id);
    setTrades((prev) =>
      prev.map((x) => (x.id === trade.id ? { ...x, tags: nextCsv } : x))
    );

    try {
      await updateTradeTags(trade.id, nextCsv);

      setSavedPulse({ id: trade.id, text: "Saved ✅" });
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedPulse(null), 800);
    } catch (e) {
      console.warn("updateTradeTags failed:", e);
      await refresh();
    } finally {
      setSavingTradeId("");
    }
  }

  function clearFilters() {
    setStrategyFilter("");
    setTagFilter("");
    setSessionFilter("");
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 26, fontWeight: "900" }}>Journal</Text>
        <Text style={{ color: "#666" }}>
          Trade history + review. This is your “discipline mirror”.
        </Text>
      </View>

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

      {/* Window selector */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "900" }}>Window</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Chip text="7d" active={windowDays === 7} onPress={() => setWindowDays(7)} />
          <Chip
            text="14d"
            active={windowDays === 14}
            onPress={() => setWindowDays(14)}
          />
          <Chip
            text="30d"
            active={windowDays === 30}
            onPress={() => setWindowDays(30)}
          />
        </View>
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

      {/* Tag + session filters */}
      <View style={card}>
        <Text style={{ fontWeight: "900" }}>Filters</Text>

        <Text style={{ fontWeight: "800" }}>Tag (optional)</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Chip text="Any" active={!tagFilter} onPress={() => setTagFilter("")} />
          {TAG_OPTIONS.map((t) => (
            <Chip
              key={t.key}
              text={t.label}
              active={tagFilter === t.key}
              onPress={() => setTagFilter(t.key)}
            />
          ))}
        </View>

        <Text style={{ fontWeight: "800" }}>Session contains (optional)</Text>
        <TextInput
          value={sessionFilter}
          onChangeText={setSessionFilter}
          placeholder="London / NY / Asia"
          style={input}
        />

        <Pressable onPress={clearFilters} style={btnOutline}>
          <Text style={{ fontWeight: "900" }}>Clear Filters</Text>
        </Pressable>
      </View>

      {/* Summary */}
      <View style={card}>
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
          Tap a trade for details. Hold to delete.
        </Text>
      </View>

      {/* Trades grouped by day */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "900" }}>Trades</Text>

        {grouped.length === 0 ? (
          <View style={emptyCard}>
            <Text style={{ fontWeight: "900" }}>No trades found</Text>
            <Text style={{ color: "#666" }}>
              Log trades, then come back here to review patterns.
            </Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.dayKey} style={{ gap: 8 }}>
              <Text style={{ fontWeight: "900", fontSize: 16 }}>
                {g.dayKey === todayKey() ? `Today (${g.dayKey})` : g.dayKey}
              </Text>

              {g.trades.map((t) => {
                const name = displayStrategyName(t);
                const r = t.resultR;
                const isWin = r > 0;
                const hasRuleBreak = (t.ruleBreaks || "").trim().length > 0;
                const tagLine = niceTags(t.tags || "");
                const tags = parseTagsCsv(t.tags || "").map((x) => x.toUpperCase());
                const busy = savingTradeId === t.id;

                return (
                  <Pressable
                    key={t.id}
                    onPress={() =>
                      router.push({
                        pathname: "/trade/[id]",
                        params: { id: t.id },
                      })
                    }
                    onLongPress={() => confirmDelete(t)}
                    style={{
                      borderWidth: 1,
                      borderColor: "#eee",
                      borderRadius: 14,
                      padding: 12,
                      gap: 8,
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
                        <Text style={{ fontWeight: "900", fontSize: 16 }}>
                          {name}
                        </Text>
                        <Text style={{ color: "#666" }}>
                          {fmtTime(t.createdAt)} • {t.session || "—"} •{" "}
                          {t.timeframe || "—"} • {t.bias || "—"}
                        </Text>

                        {tagLine ? (
                          <Text style={{ color: "#444", fontWeight: "900" }}>
                            🏷 {tagLine}
                          </Text>
                        ) : null}
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

                    {/* Quick tags */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {TAG_OPTIONS.map((opt) => {
                        const active = tags.includes(opt.key);
                        return (
                          <Pressable
                            key={opt.key}
                            disabled={!!savingTradeId}
                            onPress={() => toggleQuickTag(t, opt.key)}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: active ? "#111" : "#ddd",
                              backgroundColor: active ? "#111" : "white",
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            <Text
                              style={{
                                fontWeight: "900",
                                color: active ? "white" : "#111",
                              }}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}

                      {savedPulse?.id === t.id ? (
                        <Text
                          style={{
                            fontWeight: "900",
                            color: "#0a7a2f",
                            alignSelf: "center",
                          }}
                        >
                          {savedPulse.text}
                        </Text>
                      ) : null}
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
              })}
            </View>
          ))
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

const card = {
  borderWidth: 1,
  borderColor: "#eee",
  borderRadius: 14,
  padding: 12,
  gap: 10,
  backgroundColor: "#fafafa",
} as const;

const emptyCard = {
  borderWidth: 1,
  borderColor: "#eee",
  borderRadius: 14,
  padding: 12,
  gap: 6,
} as const;

const input = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  padding: 12,
  backgroundColor: "white",
} as const;

const btnOutline = {
  borderWidth: 1,
  borderColor: "#ddd",
  padding: 14,
  borderRadius: 12,
  alignItems: "center",
} as const;
