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
import { getDailyPlan, getSetting, upsertDailyPlan } from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type SaveState = "idle" | "saving" | "saved";

export default function PlanTab() {
  const dayKey = useMemo(() => todayKey(), []);
  const [loading, setLoading] = useState(true);

  const [bias, setBias] = useState("");
  const [newsCaution, setNewsCaution] = useState(false);
  const [keyLevels, setKeyLevels] = useState("");
  const [scenarios, setScenarios] = useState("");

  const [isRealMode, setIsRealMode] = useState(false);

  // ✅ New: track if user changed anything since last save/load
  const [dirty, setDirty] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useCallback(() => {
    setDirty(true);
    // If we were "saved", revert to idle so UI shows "Not saved" until save again
    if (saveState === "saved") setSaveState("idle");
  }, [saveState]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [planRow, appModeSetting] = await Promise.all([
        getDailyPlan(dayKey),
        getSetting("appMode"), // ✅ consistent key
      ]);

      setIsRealMode((appModeSetting ?? "") === "real");

      if (planRow) {
        setBias(planRow.bias ?? "");
        setNewsCaution(!!planRow.newsCaution);
        setKeyLevels(planRow.keyLevels ?? "");
        setScenarios(planRow.scenarios ?? "");

        // ✅ If plan exists, show Saved ✅ by default (until user edits)
        setSaveState("saved");
        setDirty(false);
      } else {
        setBias("");
        setNewsCaution(false);
        setKeyLevels("");
        setScenarios("");

        setSaveState("idle");
        setDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }, [dayKey]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
      };
    }, [refresh])
  );

  const hasAnyContent = useMemo(() => {
    return (
      (bias || "").trim().length > 0 ||
      (keyLevels || "").trim().length > 0 ||
      (scenarios || "").trim().length > 0 ||
      !!newsCaution
    );
  }, [bias, keyLevels, scenarios, newsCaution]);

  const canSave = useMemo(() => {
    if (loading) return false;
    if (saveState === "saving") return false;
    if (!dirty) return false; // ✅ only save when something changed
    if (!hasAnyContent) return false; // keep simple: don't save empty plans
    return true;
  }, [loading, saveState, dirty, hasAnyContent]);

  const planStatusLabel = useMemo(() => {
    if (loading) return "Loading…";
    if (saveState === "saving") return "Saving…";
    if (saveState === "saved" && !dirty) return "Saved ✅";
    return "Not saved";
  }, [loading, saveState, dirty]);

  const planStatusColor = useMemo(() => {
    if (saveState === "saved" && !dirty) return "#0a7a2f";
    if (saveState === "saving") return "#b26a00";
    return "#666";
  }, [saveState, dirty]);

  const allowInputs = useMemo(() => true, []);

  async function savePlan() {
    if (!canSave) return;

    setSaveState("saving");
    try {
      await upsertDailyPlan(dayKey, {
        bias: bias.trim(),
        newsCaution,
        keyLevels: keyLevels.trim(),
        scenarios: scenarios.trim(),
      });

      // ✅ Saved stays "Saved ✅" until user edits again
      setSaveState("saved");
      setDirty(false);

      // kill any old timers (we no longer auto-reset)
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    } catch (e) {
      console.warn("Save plan failed:", e);
      setSaveState("idle");
    }
  }

  const quickBiasOptions = ["Bullish", "Bearish", "Neutral"] as const;

  const templateLevels = useMemo(() => {
    return [
      "Asia High / Asia Low",
      "EQ / 50% level",
      "Daily Pivot / Weekly Pivot",
      "250 / 125 pip zones",
      "Key S/R (HTF)",
      "Liquidity pools (swing highs/lows)",
    ].join("\n");
  }, []);

  const templateScenarios = useMemo(() => {
    return [
      "If price sweeps Asia High then rejects → look for sell structure.",
      "If price holds above EQ and makes higher lows → look for buy continuation.",
      "If news spike occurs → reduce size or stand down (discipline rule).",
    ].join("\n");
  }, []);

  const headerSubtitle = useMemo(() => {
    if (isRealMode) return "REAL MODE: Plan first. Trade only if rules allow.";
    return "DEMO MODE: Build your discipline plan and test flows.";
  }, [isRealMode]);

  const saveButtonText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved" && !dirty
      ? "Saved ✅"
      : "Save Plan";

  const saveButtonBg =
    saveState === "saved" && !dirty ? "#0a7a2f" : canSave ? "#111" : "#bbb";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 26, fontWeight: "900" }}>Daily Plan</Text>
        <Text style={{ color: "#666" }}>{headerSubtitle}</Text>
      </View>

      {/* Status card */}
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
        <Text style={{ fontWeight: "900" }}>Today</Text>
        <Text style={{ color: "#666" }}>{dayKey}</Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: planStatusColor, fontWeight: "900" }}>
            {planStatusLabel}
          </Text>

          <Pressable
            onPress={refresh}
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>{loading ? "…" : "Refresh"}</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#666" }}>
          Goal: write a plan you can follow without emotion.
        </Text>
      </View>

      {/* Bias */}
      <View style={card}>
        <Text style={{ fontWeight: "900" }}>Bias</Text>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {quickBiasOptions.map((b) => {
            const active = (bias || "").trim().toLowerCase() === b.toLowerCase();
            return (
              <Pressable
                key={b}
                onPress={() => {
                  markDirty();
                  setBias(b);
                }}
                disabled={!allowInputs}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? "#111" : "#ddd",
                  backgroundColor: active ? "#111" : "white",
                  opacity: allowInputs ? 1 : 0.6,
                }}
              >
                <Text
                  style={{
                    fontWeight: "900",
                    color: active ? "white" : "#111",
                  }}
                >
                  {b}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={bias}
          onChangeText={(v) => {
            markDirty();
            setBias(v);
          }}
          placeholder="Optional custom bias notes…"
          editable={allowInputs}
          style={input}
        />
      </View>

      {/* News Caution */}
      <View style={card}>
        <Text style={{ fontWeight: "900" }}>News Caution</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ color: "#666", flex: 1 }}>
            Turn on if high-impact news may cause spikes (CPI, NFP, FOMC, etc.).
          </Text>
          <Switch
            value={newsCaution}
            onValueChange={(v) => {
              markDirty();
              setNewsCaution(v);
            }}
          />
        </View>
      </View>

      {/* Key Levels */}
      <View style={card}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Key Levels</Text>
          <Pressable
            onPress={() => {
              if (!keyLevels.trim()) {
                markDirty();
                setKeyLevels(templateLevels);
              }
            }}
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Template</Text>
          </Pressable>
        </View>

        <TextInput
          value={keyLevels}
          onChangeText={(v) => {
            markDirty();
            setKeyLevels(v);
          }}
          placeholder="Write key levels for today…"
          editable={allowInputs}
          multiline
          style={[input, { minHeight: 130, textAlignVertical: "top" }]}
        />

        <Text style={{ color: "#666" }}>
          Tip: list only the most important levels you will respect.
        </Text>
      </View>

      {/* Scenarios */}
      <View style={card}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "900" }}>If–Then Scenarios</Text>
          <Pressable
            onPress={() => {
              if (!scenarios.trim()) {
                markDirty();
                setScenarios(templateScenarios);
              }
            }}
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Template</Text>
          </Pressable>
        </View>

        <TextInput
          value={scenarios}
          onChangeText={(v) => {
            markDirty();
            setScenarios(v);
          }}
          placeholder="Write your scenarios for today…"
          editable={allowInputs}
          multiline
          style={[input, { minHeight: 140, textAlignVertical: "top" }]}
        />

        <Text style={{ color: "#666" }}>
          Example: “If sweep happens, I wait for confirmation (no impulse).”
        </Text>
      </View>

      {/* Save */}
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={savePlan}
          disabled={!canSave}
          style={{
            backgroundColor: saveButtonBg,
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            opacity: saveState === "saving" ? 0.8 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            {saveButtonText}
          </Text>
        </Pressable>

        <Text style={{ color: "#666" }}>
          {saveState === "saved" && !dirty
            ? "Plan saved. Now you trade like a machine."
            : "Write a plan that removes emotion and makes your actions predictable."}
        </Text>
      </View>

      {/* Small footer */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "900" }}>How this will evolve</Text>
        <Text style={{ color: "#666" }}>
          Later we’ll add: plan lock, required checklist, session windows,
          discipline score, and auto-insights from your trades.
        </Text>
      </View>
    </ScrollView>
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

const input = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  padding: 12,
  backgroundColor: "white",
} as const;
