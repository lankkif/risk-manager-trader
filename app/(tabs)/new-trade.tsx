import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, sList] = await Promise.all([evaluateGate(), listStrategies()]);
      setRes(r);
      setStrategies(sList);

      // ✅ Step 13.1:
      // If we navigated here from Strategy Detail with a strategyId param,
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

  async function logTrade() {
    if (!res) return;
    if (saving) return;

    const locked = res.mode === "real" && !res.canTrade && !res.overrideActive;
    if (locked) {
      showToast("error", "Locked by rules. Complete your requirements first.");
      return;
    }

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
        strategyName: selectedStrategy.name, // ✅ snapshot name for fallback if strategy is deleted later
        ruleBreaks:
          res.mode === "real" && res.overrideActive ? "OVERRIDE_USED" : "",
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

  if (loading || !res) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          Checking permission…
        </Text>
      </View>
    );
  }

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
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>{toastText}</Text>
          </View>
        </Animated.View>
      ) : null}

      <ScrollView
        style={{ flex: 1, backgroundColor: "white" }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      >
        <View
          style={{
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor:
              res.mode === "demo"
                ? "#b7d7ff"
                : res.overrideActive
                ? "#ffd38a"
                : "#b7f7c1",
            backgroundColor:
              res.mode === "demo"
                ? "#f2f8ff"
                : res.overrideActive
                ? "#fff7ea"
                : "#f2fff4",
            gap: 6,
          }}
        >
          <Text style={{ fontWeight: "900" }}>
            {res.mode === "demo"
              ? "🧪 DEMO MODE (Gate bypassed)"
              : res.overrideActive
              ? "⚠ REAL MODE: OVERRIDE ACTIVE"
              : "✅ REAL MODE: Allowed"}
          </Text>
          {res.overrideActive ? (
            <Text style={{ color: "#666" }}>
              This session is a rule-break (logged as OVERRIDE_USED).
            </Text>
          ) : null}
        </View>

        <Text style={{ fontSize: 24, fontWeight: "900" }}>New Trade Log</Text>

        <Text style={{ color: "#666" }}>
          Pick a strategy first. This is how we build stats + fix what’s not
          working.
        </Text>

        <Text style={{ fontWeight: "800" }}>Strategy</Text>
        {strategies.length === 0 ? (
          <Text style={{ color: "#b00020" }}>
            No strategies yet. Add one in Admin → Strategy Manager.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {strategies.slice(0, 6).map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setStrategyId(s.id)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: s.id === strategyId ? "#111" : "#ddd",
                  backgroundColor: s.id === strategyId ? "#111" : "white",
                }}
              >
                <Text
                  style={{
                    color: s.id === strategyId ? "white" : "#111",
                    fontWeight: "900",
                  }}
                >
                  {s.name}
                </Text>
                <Text style={{ color: s.id === strategyId ? "#ddd" : "#666" }}>
                  {s.market.toUpperCase()} • {s.styleTags || "—"} •{" "}
                  {s.timeframes || "—"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={{ fontWeight: "800", marginTop: 6 }}>Session</Text>
        <Row>
          <Chip text="Asia" active={session === "Asia"} onPress={() => setSession("Asia")} />
          <Chip text="London" active={session === "London"} onPress={() => setSession("London")} />
          <Chip text="NY" active={session === "NY"} onPress={() => setSession("NY")} />
        </Row>

        <Text style={{ fontWeight: "800" }}>Timeframe</Text>
        <Row>
          <Chip text="M5" active={timeframe === "M5"} onPress={() => setTimeframe("M5")} />
          <Chip text="M15" active={timeframe === "M15"} onPress={() => setTimeframe("M15")} />
          <Chip text="H1" active={timeframe === "H1"} onPress={() => setTimeframe("H1")} />
        </Row>

        <Text style={{ fontWeight: "800" }}>Bias</Text>
        <Row>
          <Chip text="Bull" active={bias === "Bull"} onPress={() => setBias("Bull")} />
          <Chip text="Bear" active={bias === "Bear"} onPress={() => setBias("Bear")} />
          <Chip text="Neutral" active={bias === "Neutral"} onPress={() => setBias("Neutral")} />
        </Row>

        <Text style={{ fontWeight: "800" }}>Result (R)</Text>
        <TextInput
          value={resultR}
          onChangeText={setResultR}
          placeholder="+1 or -1.5"
          keyboardType="numeric"
          style={inputStyle}
        />

        <Text style={{ fontWeight: "800" }}>Notes (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="What happened? Any rule breaks? Emotions?"
          style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
          multiline
        />

        <Pressable
          onPress={logTrade}
          disabled={strategies.length === 0 || saving}
          style={{
            backgroundColor: strategies.length === 0 || saving ? "#ddd" : "#111",
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            {saving ? "Saving…" : "Log Trade"}
          </Text>
        </Pressable>

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
      </ScrollView>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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

const inputStyle = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  padding: 12,
  backgroundColor: "white",
} as const;
