import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { getDailyPlan, getSetting, hasDailyPlan, upsertDailyPlan } from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toBool(v: string | null, fallback: boolean) {
  if (v === null) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const BIAS_OPTIONS = ["Bull", "Bear", "Neutral"] as const;
type BiasOption = (typeof BIAS_OPTIONS)[number];

type SaveState = "idle" | "saving" | "saved";

export default function PlanTab() {
  const key = useMemo(() => todayKey(), []);

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [mode, setMode] = useState<"demo" | "real">("demo");
  const [requireDailyPlan, setRequireDailyPlan] = useState(true);

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const [bias, setBias] = useState<BiasOption | "">("");
  const [newsCaution, setNewsCaution] = useState(false);
  const [keyLevels, setKeyLevels] = useState("");
  const [scenarios, setScenarios] = useState("");

  // ✅ Save feedback state
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [appMode, reqPlanRaw] = await Promise.all([
        getSetting("appMode"),
        getSetting("requireDailyPlan"),
      ]);

      setMode(appMode === "real" ? "real" : "demo");
      setRequireDailyPlan(toBool(reqPlanRaw, true));

      const has = await hasDailyPlan(key);
      setSaved(has);

      const plan = await getDailyPlan(key);
      if (plan) {
        setBias((plan.bias as BiasOption) || "");
        setNewsCaution(plan.newsCaution);
        setKeyLevels(plan.keyLevels || "");
        setScenarios(plan.scenarios || "");
        setLastSavedAt(plan.createdAt || null);
      } else {
        setLastSavedAt(null);
      }
    } finally {
      setLoading(false);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        // clear timer on unmount to avoid setState warnings
        if (saveResetTimer.current) {
          clearTimeout(saveResetTimer.current);
          saveResetTimer.current = null;
        }
      };
    }, [refresh])
  );

  async function save() {
    if (saveState === "saving") return;

    // clear any previous timer
    if (saveResetTimer.current) {
      clearTimeout(saveResetTimer.current);
      saveResetTimer.current = null;
    }

    setSaveState("saving");

    await upsertDailyPlan(key, {
      bias,
      newsCaution,
      keyLevels,
      scenarios,
    });

    const now = Date.now();
    setSaved(true);
    setLastSavedAt(now);

    // ✅ visual confirmation
    setSaveState("saved");

    // after a moment, return to normal
    saveResetTimer.current = setTimeout(() => {
      setSaveState("idle");
      saveResetTimer.current = null;
    }, 1200);
  }

  const headerBorder =
    saved || saveState === "saved" ? "#b7f7c1" : "#ffd38a";
  const headerBg = saved || saveState === "saved" ? "#f2fff4" : "#fff7ea";

  const buttonText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
      ? "Saved ✅"
      : "Save Plan";

  const buttonBg =
    saveState === "saved" ? "#0a7a2f" : "#111";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 160 }}
      showsVerticalScrollIndicator
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Daily Plan</Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: headerBorder,
          backgroundColor: headerBg,
          borderRadius: 14,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "900" }}>
          {saved ? "✅ Plan saved" : "⚠ Plan not saved yet"}
        </Text>

        <Text style={{ color: "#666" }}>
          Mode: <Text style={{ fontWeight: "900" }}>{mode.toUpperCase()}</Text> •
          Day: <Text style={{ fontWeight: "900" }}>{key}</Text>
        </Text>

        <Text style={{ color: "#666" }}>
          Plan required:{" "}
          <Text style={{ fontWeight: "900" }}>
            {requireDailyPlan ? "YES" : "NO"}
          </Text>
          {lastSavedAt ? (
            <>
              {" "}
              • Last saved:{" "}
              <Text style={{ fontWeight: "900" }}>
                {fmtTime(lastSavedAt)}
              </Text>
            </>
          ) : null}
        </Text>

        <Text style={{ color: "#666" }}>
          In REAL mode, this plan is your discipline gate (unless override is
          used).
        </Text>
      </View>

      {/* Bias */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Bias</Text>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {BIAS_OPTIONS.map((b) => {
            const active = bias === b;
            return (
              <Pressable
                key={b}
                onPress={() => setBias(b)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
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
                  {b}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: "#666" }}>
          Pick the day’s higher-timeframe direction (or Neutral).
        </Text>
      </View>

      {/* News Caution */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: "#fafafa",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "900" }}>News caution</Text>
          <Switch value={newsCaution} onValueChange={setNewsCaution} />
        </View>
        <Text style={{ color: "#666" }}>
          Toggle ON if high-impact news could wreck your execution.
        </Text>
      </View>

      {/* Key Levels */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Key Levels</Text>
        <TextInput
          value={keyLevels}
          onChangeText={setKeyLevels}
          placeholder="Asia high/low, pivots, EQ, 250/125 zones, HTF levels…"
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

      {/* Scenarios */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900" }}>If-Then Scenarios</Text>
        <TextInput
          value={scenarios}
          onChangeText={setScenarios}
          placeholder="If we sweep Asia High and reject → look for sell…"
          multiline
          style={{
            minHeight: 140,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "white",
            textAlignVertical: "top",
          }}
        />
      </View>

      {/* Save */}
      <Pressable
        onPress={save}
        disabled={loading || saveState === "saving"}
        style={{
          backgroundColor: buttonBg,
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>
          {loading ? "Loading…" : buttonText}
        </Text>
      </Pressable>

      <Text style={{ color: "#666" }}>
        {loading
          ? "Loading your saved plan…"
          : saveState === "saved"
          ? "Saved. You're good to trade (if your gate rules allow it)."
          : "Tip: Keep it short. The goal is discipline, not essays."}
      </Text>
    </ScrollView>
  );
}
