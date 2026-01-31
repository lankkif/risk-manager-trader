import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { insertTrade, listStrategies, Strategy } from "~/db/db";
import { evaluateGate } from "~/logic/permissions";

export default function NewTradeTab() {
  const params = useLocalSearchParams<{ strategyId?: string }>();
  const requestedStrategyId = useMemo(
    () => (params?.strategyId ? String(params.strategyId) : ""),
    [params]
  );

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [res, setRes] = useState<Awaited<ReturnType<typeof evaluateGate>> | null>(
    null
  );

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyId, setStrategyId] = useState<string>("");

  const [session, setSession] = useState("London");
  const [timeframe, setTimeframe] = useState("M15");
  const [bias, setBias] = useState("Neutral");

  const [resultR, setResultR] = useState("+1");
  const [note, setNote] = useState("");

  // Small toast message (Saved / Error)
  const [toastText, setToastText] = useState<string>("");
  const [toastKind, setToastKind] = useState<"success" | "error">("success");
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.id === strategyId) ?? null,
    [strategies, strategyId]
  );

  const hasCloseoutMissingWarning = useMemo(() => {
    if (!res) return false;
    return (
      res.mode === "real" &&
      Array.isArray(res.softWarnings) &&
      res.softWarnings.includes("CLOSEOUT_MISSING")
    );
  }, [res]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, sList] = await Promise.all([evaluateGate(), listStrategies()]);
      setRes(r);
      setStrategies(sList);

      // ✅ If we navigated here from Strategy Detail with a strategyId param,
      // preselect it (if it exists). Otherwise keep current selection or default to first.
      const existsRequested = requestedStrategyId
        ? sList.some((s) => s.id === requestedStrategyId)
        : false;

      const existsCurrent = strategyId
        ? sList.some((s) => s.id === strategyId)
        : false;

      const nextId =
        (existsRequested && requestedStrategyId) ||
        (existsCurrent && strategyId) ||
        (sList.length > 0 ? sList[0].id : "");

      if (nextId && nextId !== strategyId) setStrategyId(nextId);
    } finally {
      setLoading(false);
    }
  }, [requestedStrategyId, strategyId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  function showToast(kind: "success" | "error", text: string) {
    setToastKind(kind);
    setToastText(text);

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    toastAnim.stopAnimation();
    toastAnim.setValue(0);
    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setToastText("");
      });
    }, 900);
  }

  function parseR(input: string): number | null {
    const cleaned = input.trim().replace(",", ".");
    const v = Number(cleaned);
    if (!Number.isFinite(v)) return null;
    return v;
  }

  function buildRuleBreaks() {
    const flags: string[] = [];
    if (res?.mode === "real" && res.overrideActive) flags.push("OVERRIDE_USED");
    if (hasCloseoutMissingWarning) flags.push("CLOSEOUT_MISSING");
    return flags.join(",");
  }

  async function doSaveTrade() {
    if (!res) return;

    if (strategies.length === 0 || !selectedStrategy) {
      showToast("error", "Add a strategy first in Admin.");
      return;
    }

    const v = parseR(resultR);
    if (v === null) {
      showToast("error", "Result (R) must be a number like +1 or -1.5");
      return;
    }

    setSaving(true);
    try {
      await insertTrade({
        resultR: v,
        notes: note.trim(),
        session,
        timeframe,
        bias,
        strategyId: selectedStrategy.id,
        strategyName: selectedStrategy.name, // snapshot name for fallback if strategy is deleted later
        ruleBreaks: buildRuleBreaks(),
      });

      setNote("");
      showToast("success", "Saved ✓");
      await refresh();
    } catch (e) {
      console.warn("insertTrade failed:", e);
      showToast("error", "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function logTrade() {
    if (!res) return;
    if (saving) return;

    // HARD lock stays exactly as before (plan/max loss/max trades/etc)
    const locked = res.mode === "real" && !res.canTrade && !res.overrideActive;
    if (locked) {
      showToast("error", "Locked by rules. Complete your requirements first.");
      return;
    }

    // ✅ Step 16: Soft enforcement = extra tap confirm if closeout missing (NO lockout)
    if (hasCloseoutMissingWarning && res.mode === "real" && !res.overrideActive) {
      Alert.alert(
        "Closeout missing",
        "You haven’t completed today’s Closeout. You can still trade, but this trade will be logged as a rule break (CLOSEOUT_MISSING).",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Log anyway",
            style: "default",
            onPress: () => {
              void doSaveTrade();
            },
          },
        ]
      );
      return;
    }

    await doSaveTrade();
  }

  if (loading || !res) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          Checking permission…
        </Text>
      </View>
    );
  }

  // Only hard-lock screen (plan/max loss/etc). Soft warnings never lock you out.
  if (res.mode === "real" && !res.canTrade && !res.overrideActive) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white", gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: "900" }}>⛔ Trading Locked</Text>
        <Text style={{ color: "#666" }}>
          Complete the requirements below to unlock.
        </Text>

        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: "#eee",
            borderRadius: 12,
            gap: 6,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Blocked because:</Text>
          {res.reasons.map((r: string, i: number) => (
            <Text key={i}>• {r}</Text>
          ))}
        </View>

        {!res.requirements?.planDone ? (
          <Pressable
            onPress={() => router.push("/(tabs)/plan")}
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: "#111",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "900", color: "white" }}>Go to Plan</Text>
          </Pressable>
        ) : null}

        {res.mode === "real" ? (
          <Pressable
            onPress={() => router.push("/(tabs)/explore")}
            style={{
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ddd",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Go to Admin (Override)</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={refresh}
          style={{
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "900" }}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      {/* Toast */}
      {toastText ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 999,
            opacity: toastAnim,
            transform: [
              {
                translateY: toastAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 0],
                }),
              },
            ],
          }}
        >
          <View
            style={{
              backgroundColor: toastKind === "success" ? "#111" : "#b00020",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>{toastText}</Text>
          </View>
        </Animated.View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 220 }}
        showsVerticalScrollIndicator
      >
        <Text style={{ fontSize: 26, fontWeight: "900" }}>New Trade</Text>

        {res.mode === "real" ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: res.overrideActive ? "#ffd38a" : "#eee",
              backgroundColor: res.overrideActive ? "#fff7ea" : "#fafafa",
              borderRadius: 14,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "900" }}>
              {res.overrideActive ? "⚠ Override Active" : "✅ Gate OK"}
            </Text>
            <Text style={{ color: "#666" }}>
              Trades today: <Text style={{ fontWeight: "900" }}>{res.stats.tradeCount}</Text> • Total R:{" "}
              <Text style={{ fontWeight: "900" }}>{res.stats.sumR.toFixed(2)}R</Text>
            </Text>
            {hasCloseoutMissingWarning ? (
              <Text style={{ color: "#666" }}>
                Closeout missing is a warning only. Trades will log CLOSEOUT_MISSING.
              </Text>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: "#eee",
              backgroundColor: "#fafafa",
              borderRadius: 14,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "900" }}>DEMO mode</Text>
            <Text style={{ color: "#666" }}>
              Gate bypassed so you can build & test freely.
            </Text>
          </View>
        )}

        {/* Strategy select */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>Strategy</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {strategies.map((s) => {
              const active = s.id === strategyId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setStrategyId(s.id)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#111" : "#ddd",
                    backgroundColor: active ? "#111" : "white",
                  }}
                >
                  <Text
                    style={{
                      color: active ? "white" : "#111",
                      fontWeight: "900",
                    }}
                  >
                    {s.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>Session</Text>
          <TextInput
            value={session}
            onChangeText={setSession}
            placeholder="London / NY / Asia"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>Timeframe</Text>
          <TextInput
            value={timeframe}
            onChangeText={setTimeframe}
            placeholder="M5 / M15 / H1"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>Bias</Text>
          <TextInput
            value={bias}
            onChangeText={setBias}
            placeholder="Bull / Bear / Neutral"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>Result (R)</Text>
          <TextInput
            value={resultR}
            onChangeText={setResultR}
            placeholder="+1 / -1.5"
            keyboardType="default"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "900" }}>Notes</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Why this trade? What did you do right/wrong?"
            multiline
            style={{
              minHeight: 110,
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
              textAlignVertical: "top",
            }}
          />
        </View>

        <Pressable
          onPress={logTrade}
          disabled={saving}
          style={{
            backgroundColor: "#111",
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            {saving ? "Saving…" : "Log Trade"}
          </Text>
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
    </View>
  );
}
