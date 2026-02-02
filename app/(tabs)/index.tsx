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

function fmtR(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}R`;
}

function pct01(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return `${Math.round(v * 100)}%`;
}

function isAfterHour(hour24: number) {
  return new Date().getHours() >= hour24;
}

function Pill({
  text,
  kind = "neutral",
}: {
  text: string;
  kind?: "neutral" | "good" | "warn" | "bad";
}) {
  const bg =
    kind === "good"
      ? "#e9fff0"
      : kind === "warn"
      ? "#fff6e6"
      : kind === "bad"
      ? "#ffe9ee"
      : "#f3f4f6";
  const border =
    kind === "good"
      ? "#baf2c8"
      : kind === "warn"
      ? "#ffd59b"
      : kind === "bad"
      ? "#ffbac6"
      : "#e5e7eb";
  const color =
    kind === "good"
      ? "#0a6a2a"
      : kind === "warn"
      ? "#7a4b00"
      : kind === "bad"
      ? "#8a1026"
      : "#111827";

  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
      }}
    >
      <Text style={{ fontWeight: "900", color, fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 14,
        backgroundColor: "white",
        gap: 6,
      }}
    >
      <Text style={{ color: "#666", fontWeight: "800", fontSize: 12 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: "900" }}>{value}</Text>
      {sub ? <Text style={{ color: "#777", fontSize: 12 }}>{sub}</Text> : null}
    </View>
  );
}

function ActionButton({
  title,
  subtitle,
  onPress,
  kind = "primary",
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
}) {
  const bg = kind === "primary" ? "#111" : "white";
  const borderColor = kind === "primary" ? "#111" : "#ddd";
  const titleColor = kind === "primary" ? "white" : "#111";
  const subColor = kind === "primary" ? "#d6d6d6" : "#666";

  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor,
        backgroundColor: bg,
        gap: 6,
      }}
    >
      <Text style={{ color: titleColor, fontWeight: "900", fontSize: 16 }}>
        {title}
      </Text>
      <Text style={{ color: subColor, fontSize: 12 }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function HomeDashboardTab() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<Awaited<ReturnType<typeof evaluateGate>> | null>(
    null
  );

  const [tradeCount, setTradeCount] = useState(0);
  const [totalR, setTotalR] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [wins, setWins] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const key = todayKey();
      const [g, stats] = await Promise.all([evaluateGate(), getTradeStatsForDay(key)]);
      setGate(g);

      // permissions.ts guarantees these exist (stable)
      setTradeCount(g?.stats?.tradeCount ?? 0);
      setTotalR(g?.stats?.sumR ?? 0);

      // day stats gives wins/winRate reliably (even if gate only tracks streaks)
      const t = (stats as any) ?? {};
      const c = typeof t.tradeCount === "number" ? t.tradeCount : 0;
      const w = typeof t.wins === "number" ? t.wins : 0;
      setWins(w);
      setWinRate(c > 0 ? w / c : 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const isReal = gate?.mode === "real";
  const locked = useMemo(() => {
    if (!gate) return false;
    return gate.mode === "real" && !gate.canTrade && !gate.overrideActive;
  }, [gate]);

  const planMissing = useMemo(() => {
    if (!gate) return false;
    return (
      gate.mode === "real" &&
      Array.isArray(gate.softWarnings) &&
      gate.softWarnings.includes("PLAN_MISSING")
    );
  }, [gate]);

  const closeoutMissing = useMemo(() => {
    if (!gate) return false;
    return (
      gate.mode === "real" &&
      Array.isArray(gate.softWarnings) &&
      gate.softWarnings.includes("CLOSEOUT_MISSING")
    );
  }, [gate]);

  // Closeout soft nudge after 20:00 if you traded today
  const showCloseoutNudge = useMemo(() => {
    if (!gate) return false;
    if (gate.mode !== "real") return false;
    if (!closeoutMissing) return false;
    if (tradeCount <= 0) return false;
    return isAfterHour(20);
  }, [gate, closeoutMissing, tradeCount]);

  const tradesRemaining = useMemo(() => {
    const max = gate?.settings?.maxTradesPerDay ?? 0;
    if (!max || max <= 0) return 0;
    return Math.max(0, max - tradeCount);
  }, [gate, tradeCount]);

  const lossBufferRemainingR = useMemo(() => {
    // lock triggers when sumR <= -maxDailyLossR
    const maxLoss = gate?.settings?.maxDailyLossR ?? 0;
    const buffer = maxLoss + totalR;
    return Math.max(0, buffer);
  }, [gate, totalR]);

  const consecLossesRemaining = useMemo(() => {
    const max = gate?.settings?.maxConsecutiveLosses ?? 0;
    const cur = gate?.stats?.consecutiveLosses ?? 0;
    if (!max || max <= 0) return 0;
    return Math.max(0, max - cur);
  }, [gate]);

  const gatePills = useMemo(() => {
    if (!gate) return [];
    const pills: { text: string; kind: "neutral" | "good" | "warn" | "bad" }[] = [];

    if (gate.mode === "demo") pills.push({ text: "DEMO MODE", kind: "neutral" });
    if (gate.mode === "real") pills.push({ text: "REAL MODE", kind: "neutral" });

    if (gate.overrideActive) pills.push({ text: "OVERRIDE ACTIVE", kind: "warn" });

    if (gate.mode === "real") {
      if (locked) pills.push({ text: "LOCKED", kind: "bad" });
      else pills.push({ text: "UNLOCKED", kind: "good" });
    } else {
      pills.push({ text: "GATE BYPASSED", kind: "good" });
    }

    if (planMissing) pills.push({ text: "PLAN MISSING", kind: "warn" });
    if (closeoutMissing) pills.push({ text: "CLOSEOUT MISSING", kind: "warn" });

    return pills;
  }, [gate, locked, planMissing, closeoutMissing]);

  if (loading || !gate) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>Dashboard</Text>
        <Text style={{ marginTop: 10, color: "#666" }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
      >
        {/* HEADER */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 26, fontWeight: "900" }}>Dashboard</Text>
          <Text style={{ color: "#666" }}>
            Command Center • {todayKey()}
          </Text>
        </View>

        {/* STATUS STRIP */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {gatePills.map((p, idx) => (
            <Pill key={`${p.text}-${idx}`} text={p.text} kind={p.kind} />
          ))}
        </View>

        {/* LOCK REASONS */}
        {isReal && locked ? (
          <View
            style={{
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#ffbac6",
              backgroundColor: "#fff5f7",
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: "900" }}>Why you’re locked</Text>
            {(gate.reasons ?? []).length === 0 ? (
              <Text style={{ color: "#8a1026" }}>Locked by rules.</Text>
            ) : (
              (gate.reasons ?? []).map((r, i) => (
                <Text key={i} style={{ color: "#8a1026" }}>
                  • {r}
                </Text>
              ))
            )}
            <Text style={{ color: "#666", marginTop: 4, fontSize: 12 }}>
              If you *must* trade, use Override (Rules tab) — but it will be recorded.
            </Text>
          </View>
        ) : null}

        {/* SOFT NUDGE */}
        {showCloseoutNudge ? (
          <View
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: "#ffd59b",
              backgroundColor: "#fff7ea",
              borderRadius: 14,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "900" }}>Closeout reminder</Text>
            <Text style={{ color: "#7a4b00" }}>
              You traded today, but yesterday’s Closeout is missing. Do it now to
              stay consistent.
            </Text>
            <Pressable
              onPress={() => router.push("/closeout")}
              style={{
                alignSelf: "flex-start",
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: "#111",
                marginTop: 6,
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Open Closeout</Text>
            </Pressable>
          </View>
        ) : null}

        {/* KPI ROW */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <StatBox
            label="Trades Remaining"
            value={
              gate.mode === "demo"
                ? "∞"
                : `${tradesRemaining}/${gate.settings.maxTradesPerDay}`
            }
            sub={gate.mode === "demo" ? "Demo bypass" : `Used: ${tradeCount}`}
          />
          <StatBox
            label="Daily R (Net)"
            value={fmtR(totalR)}
            sub={`Win rate: ${pct01(winRate)} (${wins}/${tradeCount || 0})`}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <StatBox
            label="Loss Buffer Remaining"
            value={gate.mode === "demo" ? "—" : `${lossBufferRemainingR.toFixed(2)}R`}
            sub={
              gate.mode === "demo"
                ? "Only tracked in Real mode"
                : `Daily limit: ${gate.settings.maxDailyLossR}R`
            }
          />
          <StatBox
            label="Losses Remaining (Streak)"
            value={gate.mode === "demo" ? "—" : String(consecLossesRemaining)}
            sub={
              gate.mode === "demo"
                ? "Only tracked in Real mode"
                : `Current: ${gate.stats.consecutiveLosses}/${gate.settings.maxConsecutiveLosses}`
            }
          />
        </View>

        {/* QUICK ACTIONS */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "900" }}>Quick Actions</Text>

          <View style={{ gap: 10 }}>
            <ActionButton
              title="Start Daily Plan"
              subtitle="Plan → then trade like a machine"
              onPress={() => router.push("/plan")}
              kind="primary"
            />
            <ActionButton
              title="Log Trade"
              subtitle="Fast logging (R + strategy + notes)"
              onPress={() => router.push("/new-trade")}
              kind="primary"
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Close Day"
                  subtitle="Journal + reflection"
                  onPress={() => router.push("/closeout")}
                  kind="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Rules & Limits"
                  subtitle="Gate / override / rules"
                  onPress={() => router.push("/settings")}
                  kind="secondary"
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Trades"
                  subtitle="View logged trades"
                  onPress={() => router.push("/journal")}
                  kind="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Strategies"
                  subtitle="Your playbook"
                  onPress={() => router.push("/explore")}
                  kind="secondary"
                />
              </View>
            </View>
          </View>
        </View>

        {/* PHASE 2+ PLACEHOLDER */}
        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: "#eee",
            borderRadius: 14,
            backgroundColor: "#fafafa",
            gap: 6,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Coming next (Phase 2)</Text>
          <Text style={{ color: "#666" }}>
            Real Risk Manager: account profile, daily $ budget remaining, prop target
            bar, position sizing calculator, and session window enforcement.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
