import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Pressable,
    ScrollView,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { getSetting, setSetting } from "../../src/db/db";

type SettingsState = {
  // rules
  maxTradesPerDay: string;
  maxDailyLossR: string;
  maxConsecutiveLosses: string;
  defaultRiskPercent: string;
  requireDailyPlan: boolean;
  requireDailyCloseout: boolean;

  // mode / override
  demoMode: boolean; // true = demo, false = real
  gateOverrideUntil: number; // ms timestamp
  gateOverrideCooldownUntil: number; // ms timestamp
};

const DEFAULTS: SettingsState = {
  maxTradesPerDay: "3",
  maxDailyLossR: "2",
  maxConsecutiveLosses: "2",
  defaultRiskPercent: "1",
  requireDailyPlan: true,
  requireDailyCloseout: true,

  demoMode: true, // START IN DEMO ✅
  gateOverrideUntil: 0,
  gateOverrideCooldownUntil: 0,
};

function toBool(v: string | null, fallback: boolean) {
  if (v === null) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function toNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isValidNumberStr(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

function formatTime(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString();
}

export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">(
    "saved"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [s, setS] = useState<SettingsState>(DEFAULTS);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSave = useRef(true);

  // Toast animation
  const toastOpacity = useRef(new Animated.Value(0)).current;

  function showSavedToast() {
    toastOpacity.stopAnimation();
    toastOpacity.setValue(0);

    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(900),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }

  async function load() {
    setLoading(true);
    try {
      const [
        maxTradesPerDay,
        maxDailyLossR,
        maxConsecutiveLosses,
        defaultRiskPercent,
        requireDailyPlan,
        requireDailyCloseout,

        appMode,
        gateOverrideUntil,
        gateOverrideCooldownUntil,
      ] = await Promise.all([
        getSetting("maxTradesPerDay"),
        getSetting("maxDailyLossR"),
        getSetting("maxConsecutiveLosses"),
        getSetting("defaultRiskPercent"),
        getSetting("requireDailyPlan"),
        getSetting("requireDailyCloseout"),

        getSetting("appMode"),
        getSetting("gateOverrideUntil"),
        getSetting("gateOverrideCooldownUntil"),
      ]);

      const demoMode = appMode === "real" ? false : true;

      const next: SettingsState = {
        maxTradesPerDay: maxTradesPerDay ?? DEFAULTS.maxTradesPerDay,
        maxDailyLossR: maxDailyLossR ?? DEFAULTS.maxDailyLossR,
        maxConsecutiveLosses:
          maxConsecutiveLosses ?? DEFAULTS.maxConsecutiveLosses,
        defaultRiskPercent: defaultRiskPercent ?? DEFAULTS.defaultRiskPercent,
        requireDailyPlan: toBool(requireDailyPlan, DEFAULTS.requireDailyPlan),
        requireDailyCloseout: toBool(
          requireDailyCloseout,
          DEFAULTS.requireDailyCloseout
        ),

        demoMode,
        gateOverrideUntil: toNum(gateOverrideUntil, 0),
        gateOverrideCooldownUntil: toNum(gateOverrideCooldownUntil, 0),
      };

      setS(next);
      setStatus("saved");
      setErrorMsg("");
      skipNextAutoSave.current = true;
    } finally {
      setLoading(false);
    }
  }

  async function persist(current: SettingsState) {
    // validate numbers
    if (
      !isValidNumberStr(current.maxTradesPerDay) ||
      !isValidNumberStr(current.maxDailyLossR) ||
      !isValidNumberStr(current.maxConsecutiveLosses) ||
      !isValidNumberStr(current.defaultRiskPercent)
    ) {
      setStatus("error");
      setErrorMsg("Fix numeric fields (must be number ≥ 0) to save.");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    try {
      await Promise.all([
        setSetting("maxTradesPerDay", current.maxTradesPerDay.trim()),
        setSetting("maxDailyLossR", current.maxDailyLossR.trim()),
        setSetting("maxConsecutiveLosses", current.maxConsecutiveLosses.trim()),
        setSetting("defaultRiskPercent", current.defaultRiskPercent.trim()),
        setSetting("requireDailyPlan", current.requireDailyPlan ? "1" : "0"),
        setSetting(
          "requireDailyCloseout",
          current.requireDailyCloseout ? "1" : "0"
        ),

        // mode + override
        setSetting("appMode", current.demoMode ? "demo" : "real"),
        setSetting("gateOverrideUntil", String(current.gateOverrideUntil || 0)),
        setSetting(
          "gateOverrideCooldownUntil",
          String(current.gateOverrideCooldownUntil || 0)
        ),
      ]);

      setStatus("saved");
      showSavedToast();
    } catch (e) {
      console.warn("Auto-save failed:", e);
      setStatus("error");
      setErrorMsg("Save failed. Please reload the app and try again.");
    }
  }

  // Auto-save debounce
  useEffect(() => {
    if (loading) return;

    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }

    setStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      persist(s);
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [s, loading]);

  useEffect(() => {
    load();
  }, []);

  const statusText = useMemo(() => {
    if (loading) return "Loading…";
    if (status === "saving") return "Saving…";
    if (status === "error") return `⚠ Not saved — ${errorMsg}`;
    return "";
  }, [loading, status, errorMsg]);

  // Override logic
  const now = Date.now();
  const isRealMode = !s.demoMode;
  const overrideActive = isRealMode && now < s.gateOverrideUntil;
  const cooldownActive = isRealMode && now < s.gateOverrideCooldownUntil;

  async function enableOverride1h() {
    const now2 = Date.now();
    if (now2 < s.gateOverrideCooldownUntil) return;

    const overrideUntil = now2 + 60 * 60 * 1000; // 1 hour
    const cooldownUntil = now2 + 24 * 60 * 60 * 1000; // 24 hours

    const next = {
      ...s,
      gateOverrideUntil: overrideUntil,
      gateOverrideCooldownUntil: cooldownUntil,
    };

    setS(next);
    // Save immediately (don’t wait debounce)
    await persist(next);
  }

  async function clearOverride() {
    const next = { ...s, gateOverrideUntil: 0 };
    setS(next);
    await persist(next);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 24, fontWeight: "800" }}>Rules & Limits</Text>

        {loading ? <Text>Loading…</Text> : null}

        {!loading && (status === "saving" || status === "error") ? (
          <Text
            style={{
              color: status === "error" ? "#b00020" : "#666",
              fontWeight: "800",
            }}
          >
            {statusText}
          </Text>
        ) : null}

        {/* MODE */}
        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: "#eee",
            borderRadius: 12,
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 16 }}>App Mode</Text>

          <RowSwitch
            label="Demo Mode (bypass gate)"
            value={s.demoMode}
            onValueChange={(v) => setS((p) => ({ ...p, demoMode: v }))}
          />

          <Text style={{ color: "#666" }}>
            {s.demoMode
              ? "Demo lets you build/test freely. Gate is bypassed."
              : "Real mode enforces your gate rules."}
          </Text>

          {/* Override controls only in REAL mode */}
          {!s.demoMode ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <Text style={{ fontWeight: "900" }}>Gate Override (Real Mode)</Text>

              {overrideActive ? (
                <Text style={{ color: "#666" }}>
                  ⚠ Override ACTIVE until: {formatTime(s.gateOverrideUntil)}
                </Text>
              ) : (
                <Text style={{ color: "#666" }}>
                  Override is OFF. Use only when necessary.
                </Text>
              )}

              {cooldownActive ? (
                <Text style={{ color: "#666" }}>
                  Cooldown until: {formatTime(s.gateOverrideCooldownUntil)}
                </Text>
              ) : null}

              <Pressable
                onPress={enableOverride1h}
                disabled={cooldownActive}
                style={{
                  backgroundColor: cooldownActive ? "#999" : "#111",
                  padding: 14,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>
                  Enable Override (1 hour)
                </Text>
              </Pressable>

              {overrideActive ? (
                <Pressable
                  onPress={clearOverride}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#ddd",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900" }}>Turn Override Off</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* RULE FIELDS */}
        <Field
          label="Max trades per day"
          value={s.maxTradesPerDay}
          onChange={(v) => setS((p) => ({ ...p, maxTradesPerDay: v }))}
          hint="Example: 3"
        />

        <Field
          label="Max daily loss (R)"
          value={s.maxDailyLossR}
          onChange={(v) => setS((p) => ({ ...p, maxDailyLossR: v }))}
          hint="Example: 2 locks trading at -2R"
        />

        <Field
          label="Stop after consecutive losses"
          value={s.maxConsecutiveLosses}
          onChange={(v) => setS((p) => ({ ...p, maxConsecutiveLosses: v }))}
          hint="Example: 2 means stop after 2 losing trades in a row"
        />

        <Field
          label="Default risk % per trade"
          value={s.defaultRiskPercent}
          onChange={(v) => setS((p) => ({ ...p, defaultRiskPercent: v }))}
          hint="Example: 1 means 1% risk per trade"
        />

        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: "#eee",
            borderRadius: 12,
            gap: 12,
          }}
        >
          <RowSwitch
            label="Require Daily Plan before trading"
            value={s.requireDailyPlan}
            onValueChange={(v) =>
              setS((p) => ({ ...p, requireDailyPlan: v }))
            }
          />

          <RowSwitch
            label="Require Daily Closeout before trading"
            value={s.requireDailyCloseout}
            onValueChange={(v) =>
              setS((p) => ({ ...p, requireDailyCloseout: v }))
            }
          />
        </View>
      </ScrollView>

      {/* Saved toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          opacity: toastOpacity,
          position: "absolute",
          top: 12,
          alignSelf: "center",
          backgroundColor: "rgba(17,17,17,0.92)",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: "white", fontWeight: "800" }}>Saved ✅</Text>
      </Animated.View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const invalid = value.trim() !== "" && !isValidNumberStr(value);

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: "800" }}>{label}</Text>
      {hint ? <Text style={{ color: "#666" }}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        style={{
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          borderColor: invalid ? "#ff6b6b" : "#ddd",
          backgroundColor: "white",
        }}
      />
      {invalid ? (
        <Text style={{ color: "#b00020" }}>Must be a number ≥ 0</Text>
      ) : null}
    </View>
  );
}

function RowSwitch({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, fontWeight: "800" }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
