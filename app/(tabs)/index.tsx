import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getTradeStatsForDay } from "~/db/db";
import { evaluateGate } from "~/logic/permissions";

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

function isAfterHour(hour24: number) {
  return new Date().getHours() >= hour24;
}

export default function StatusTab() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<Awaited<ReturnType<typeof evaluateGate>> | null>(
    null
  );

  const [tradeCount, setTradeCount] = useState(0);
  const [totalR, setTotalR] = useState(0);
  const [winRate, setWinRate] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const key = todayKey();
      const [g, statsRaw] = await Promise.all([
        evaluateGate(),
        getTradeStatsForDay(key),
      ]);

      setGate(g);

      // Make this resilient to whatever your TradeStats shape is:
      const s: any = statsRaw ?? {};

      const count = pickNum(s, ["tradeCount", "count", "trades", "nTrades"], 0);

      // R total could be named many things depending on earlier versions
      let rTotal = pickNum(
        s,
        ["totalR", "sumR", "netR", "total_r", "rTotal"],
        NaN
      );

      // If not present, try compute from avgR * count
      if (!Number.isFinite(rTotal)) {
        const avgR = pickNum(s, ["avgR", "averageR", "meanR"], 0);
        rTotal = avgR * count;
      }

      // Win rate could be direct, or computed from wins / count
      let wr = pickNum(s, ["winRate", "wr", "win_rate"], NaN);
      if (!Number.isFinite(wr)) {
        const wins = pickNum(s, ["wins", "winCount"], 0);
        wr = count > 0 ? wins / count : 0;
      }

      setTradeCount(count);
      setTotalR(rTotal);
      setWinRate(wr);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const locked = useMemo(() => {
    if (!gate) return false;
    return gate.mode === "real" && !gate.canTrade && !gate.overrideActive;
  }, [gate]);

  const closeoutMissing = useMemo(() => {
    if (!gate) return false;
    return (
      gate.mode === "real" &&
      Array.isArray(gate.softWarnings) &&
      gate.softWarnings.includes("CLOSEOUT_MISSING")
    );
  }, [gate]);

  // ✅ Step 17: Closeout auto-nudge (soft reminder only)
  const showCloseoutNudge = useMemo(() => {
    if (!gate) return false;
    if (gate.mode !== "real") return false;
    if (!closeoutMissing) return false;
    if (tradeCount <= 0) return false;
    // After 20:00 local time
    return isAfterHour(20);
  }, [gate, closeoutMissing, tradeCount]);

  if (loading || !gate) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
        <Text style={{ fontSize: 20, fontWeight: "900" }}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <Text style={{ fontSize: 28, fontWeight: "900" }}>Status</Text>

      {/* Gate Status Card */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderRadius: 14,
          borderColor:
            gate.mode === "demo"
              ? "#b7d7ff"
              : gate.overrideActive
              ? "#ffd38a"
              : locked
              ? "#ffb3b3"
              : "#b7f7c1",
          backgroundColor:
            gate.mode === "demo"
              ? "#f2f8ff"
              : gate.overrideActive
              ? "#fff7ea"
              : locked
              ? "#fff1f1"
              : "#f2fff4",
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "900" }}>
          {gate.mode === "demo"
            ? "🧪 DEMO MODE"
            : gate.overrideActive
            ? "⚠ REAL MODE: OVERRIDE ACTIVE"
            : locked
            ? "⛔ REAL MODE: LOCKED"
            : "✅ REAL MODE: ALLOWED"}
        </Text>

        {locked ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: "#666" }}>
              You’re locked until you complete requirements:
            </Text>
            {gate.reasons.slice(0, 3).map((r: string, i: number) => (
              <Text key={`${i}-${r}`}>• {r}</Text>
            ))}
          </View>
        ) : (
          <Text style={{ color: "#666" }}>
            Today: trade clean, log everything, stop when rules say stop.
          </Text>
        )}
      </View>

      {/* ✅ Step 17: Closeout reminder banner (soft nudge, no lockout) */}
      {showCloseoutNudge ? (
        <View
          style={{
            padding: 14,
            borderWidth: 1,
            borderRadius: 14,
            borderColor: "#ffd38a",
            backgroundColor: "#fff7ea",
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "900" }}>🟡 Closeout reminder</Text>
          <Text style={{ color: "#666" }}>
            You traded today but haven’t completed Closeout. Do it now to lock in
            learning and protect discipline.
          </Text>
          <Pressable
            // ✅ FIX: typed route (no "/(tabs)/")
            onPress={() => router.push("/closeout")}
            style={{
              backgroundColor: "#111",
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              Go to Closeout
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Today Card */}
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
          Trades: <Text style={{ fontWeight: "900" }}>{tradeCount}</Text>
        </Text>
        <Text>
          Total R: <Text style={{ fontWeight: "900" }}>{totalR.toFixed(2)}</Text>
        </Text>
        <Text>
          Win rate: <Text style={{ fontWeight: "900" }}>{pct(winRate)}</Text>
        </Text>

        {closeoutMissing && gate.mode === "real" ? (
          <Text style={{ color: "#b26a00", fontWeight: "900" }}>
            ⚠ Closeout missing (soft warning)
          </Text>
        ) : null}
      </View>

      {/* Actions */}
      <Pressable
        // ✅ FIX: typed route (no "/(tabs)/")
        onPress={() => router.push("/new-trade")}
        style={{
          backgroundColor: locked ? "#ddd" : "#111",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
        disabled={locked}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>
          {locked ? "Locked" : "Log a Trade"}
        </Text>
      </Pressable>

      {/* ✅ Correct route: open Closeout tab */}
      <Pressable
        // ✅ FIX: typed route (no "/(tabs)/")
        onPress={() => router.push("/closeout")}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Daily Closeout</Text>
      </Pressable>

      <Pressable
        // ✅ FIX: typed route (no "/(tabs)/")
        onPress={() => router.push("/journal")}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Open Journal</Text>
      </Pressable>

      <Pressable
        onPress={refresh}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}
