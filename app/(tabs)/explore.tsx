import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  deleteStrategy,
  getSetting,
  getStrategyStats,
  listStrategies,
  setSetting,
  Strategy,
  StrategyMarket,
  upsertStrategy,
} from "~/db/db";
import { evaluateGate } from "~/logic/permissions";

function formatTime(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function toBool(v: string | null, fallback: boolean) {
  if (v === null) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function toNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type SaveState = "idle" | "saving" | "saved";

export default function AdminTab() {
  // Mode/Override
  const [mode, setMode] = useState<"demo" | "real">("demo");
  const [overrideUntil, setOverrideUntil] = useState<number>(0);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // ✅ Live gate snapshot (for rule status display)
  const [gate, setGate] = useState<Awaited<ReturnType<typeof evaluateGate>> | null>(
    null
  );

  // ✅ Discipline rules
  const [requireDailyPlan, setRequireDailyPlan] = useState(true);
  const [requireDailyCloseout, setRequireDailyCloseout] = useState(true);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState("3");
  const [maxDailyLossR, setMaxDailyLossR] = useState("2");
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState("2");

  const [rulesSaveState, setRulesSaveState] = useState<SaveState>("idle");
  const rulesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Strategy manager state
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [statsById, setStatsById] = useState<Record<string, any>>({});

  // New strategy form
  const [name, setName] = useState("");
  const [market, setMarket] = useState<StrategyMarket>("gold");
  const [styleTags, setStyleTags] = useState("intraday");
  const [timeframes, setTimeframes] = useState("M5,M15,H1");
  const [description, setDescription] = useState("");
  const [checklist, setChecklist] = useState(
    "Bias confirmed\nEntry at level\nStop defined\nTP defined\nNo revenge trades"
  );
  const [imageUrl, setImageUrl] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const appMode = await getSetting("appMode");
      setMode(appMode === "real" ? "real" : "demo");

      const r = await evaluateGate();
      setGate(r);
      setOverrideUntil(r.overrideUntilMs);
      setCooldownUntil(r.overrideCooldownUntilMs);

      // ✅ Load discipline settings (fallbacks match permissions.ts defaults)
      const [
        reqPlanRaw,
        reqCloseRaw,
        maxTradesRaw,
        maxLossRaw,
        maxConsecRaw,
      ] = await Promise.all([
        getSetting("requireDailyPlan"),
        getSetting("requireDailyCloseout"),
        getSetting("maxTradesPerDay"),
        getSetting("maxDailyLossR"),
        getSetting("maxConsecutiveLosses"),
      ]);

      setRequireDailyPlan(toBool(reqPlanRaw, true));
      setRequireDailyCloseout(toBool(reqCloseRaw, true));
      setMaxTradesPerDay(String(toNum(maxTradesRaw, 3)));
      setMaxDailyLossR(String(toNum(maxLossRaw, 2)));
      setMaxConsecutiveLosses(String(toNum(maxConsecRaw, 2)));

      const [sList, sStats] = await Promise.all([
        listStrategies(),
        getStrategyStats(),
      ]);
      setStrategies(sList);
      setStatsById(sStats);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        if (rulesSaveTimerRef.current) {
          clearTimeout(rulesSaveTimerRef.current);
          rulesSaveTimerRef.current = null;
        }
      };
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleMode(toReal: boolean) {
    const next = toReal ? "real" : "demo";
    await setSetting("appMode", next);
    setMode(next);
    await refresh();
  }

  async function activateOverride() {
    const now = Date.now();
    if (now < cooldownUntil) return;

    const overrideDurationMs = 60 * 60 * 1000; // 1 hour
    const newOverrideUntil = now + overrideDurationMs;

    const newCooldownUntil = now + 24 * 60 * 60 * 1000; // 24 hours

    await setSetting("gateOverrideUntil", String(newOverrideUntil));
    await setSetting("gateOverrideCooldownUntil", String(newCooldownUntil));

    await refresh();
  }

  const now = Date.now();
  const overrideActive = mode === "real" && now < overrideUntil;
  const inCooldown = now < cooldownUntil;

  const canSaveStrategy = useMemo(() => name.trim().length >= 3, [name]);

  async function createStrategy() {
    if (!canSaveStrategy) return;

    await upsertStrategy({
      name: name.trim(),
      market,
      styleTags: styleTags.trim(),
      timeframes: timeframes.trim(),
      description: description.trim(),
      checklist: checklist.trim(),
      imageUrl: imageUrl.trim(),
    });

    setName("");
    setDescription("");
    setImageUrl("");
    await refresh();
  }

  async function removeStrategy(id: string) {
    await deleteStrategy(id);
    await refresh();
  }

  function safeNumString(s: string, fallback: number) {
    const n = Number(String(s ?? "").trim().replace(",", "."));
    if (!Number.isFinite(n)) return String(fallback);
    return String(n);
  }

  async function saveRules() {
    if (rulesSaveState === "saving") return;

    if (rulesSaveTimerRef.current) {
      clearTimeout(rulesSaveTimerRef.current);
      rulesSaveTimerRef.current = null;
    }

    setRulesSaveState("saving");

    const mt = safeNumString(maxTradesPerDay, 3);
    const mdl = safeNumString(maxDailyLossR, 2);
    const mcl = safeNumString(maxConsecutiveLosses, 2);

    // ensure UI stays clean
    setMaxTradesPerDay(mt);
    setMaxDailyLossR(mdl);
    setMaxConsecutiveLosses(mcl);

    await Promise.all([
      setSetting("requireDailyPlan", requireDailyPlan ? "1" : "0"),
      setSetting("requireDailyCloseout", requireDailyCloseout ? "1" : "0"),
      setSetting("maxTradesPerDay", mt),
      setSetting("maxDailyLossR", mdl),
      setSetting("maxConsecutiveLosses", mcl),
    ]);

    setRulesSaveState("saved");
    rulesSaveTimerRef.current = setTimeout(() => {
      setRulesSaveState("idle");
      rulesSaveTimerRef.current = null;
    }, 1200);

    await refresh();
  }

  async function resetRulesDefaults() {
    setRequireDailyPlan(true);
    setRequireDailyCloseout(true);
    setMaxTradesPerDay("3");
    setMaxDailyLossR("2");
    setMaxConsecutiveLosses("2");
    await Promise.all([
      setSetting("requireDailyPlan", "1"),
      setSetting("requireDailyCloseout", "1"),
      setSetting("maxTradesPerDay", "3"),
      setSetting("maxDailyLossR", "2"),
      setSetting("maxConsecutiveLosses", "2"),
    ]);
    await refresh();
  }

  const rulesButtonText =
    rulesSaveState === "saving"
      ? "Saving…"
      : rulesSaveState === "saved"
      ? "Saved ✅"
      : "Save Discipline Rules";

  const rulesButtonBg = rulesSaveState === "saved" ? "#0a7a2f" : "#111";

  const lockedHard =
    gate?.mode === "real" && gate && !gate.canTrade && !gate.overrideActive;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 50 }}
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Admin</Text>

      {/* ✅ Live Gate Status */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: lockedHard ? "#ffd38a" : "#eee",
          borderRadius: 14,
          gap: 8,
          backgroundColor: lockedHard ? "#fff7ea" : "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Live Gate Status</Text>

        {!gate ? (
          <Text style={{ color: "#666" }}>Loading gate…</Text>
        ) : (
          <>
            <Text style={{ color: "#666" }}>
              Mode: <Text style={{ fontWeight: "900" }}>{gate.mode.toUpperCase()}</Text>{" "}
              • Override:{" "}
              <Text style={{ fontWeight: "900" }}>
                {gate.overrideActive ? "ON" : "OFF"}
              </Text>
            </Text>

            {gate.mode === "real" ? (
              <Text style={{ color: "#666" }}>
                Today: Trades{" "}
                <Text style={{ fontWeight: "900" }}>{gate.stats.tradeCount}</Text>{" "}
                • Total R{" "}
                <Text style={{ fontWeight: "900" }}>{gate.stats.sumR.toFixed(2)}R</Text>{" "}
                • Consec losses{" "}
                <Text style={{ fontWeight: "900" }}>{gate.stats.consecutiveLosses}</Text>
              </Text>
            ) : null}

            <Text style={{ fontWeight: "900" }}>
              {gate.mode === "demo"
                ? "✅ DEMO bypasses gate"
                : gate.overrideActive
                ? "⚠ Override active (gate bypassed)"
                : gate.canTrade
                ? "✅ You can trade"
                : "⛔ Locked by rules"}
            </Text>

            {lockedHard && gate.reasons.length ? (
              <View style={{ gap: 4 }}>
                {gate.reasons.map((r, i) => (
                  <Text key={i}>• {r}</Text>
                ))}
              </View>
            ) : null}

            {/* Quick actions */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/(tabs)/plan")}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: "#111",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>Go to Plan</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/(tabs)/closeout")}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ddd",
                  backgroundColor: "white",
                }}
              >
                <Text style={{ fontWeight: "900" }}>Go to Closeout</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Mode/Override */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>App Mode</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontWeight: "800" }}>Demo</Text>
          <Switch value={mode === "real"} onValueChange={toggleMode} />
          <Text style={{ fontWeight: "800" }}>Real</Text>
        </View>

        <Text style={{ color: "#666" }}>
          Demo bypasses the gate so you can build/test. Real enforces discipline.
        </Text>

        <View style={{ height: 1, backgroundColor: "#eee" }} />

        <Text style={{ fontWeight: "900", fontSize: 16 }}>
          Master Override (Real Only)
        </Text>

        <Text style={{ color: "#666" }}>
          Use for emergencies. Activating override starts a 24h cooldown.
        </Text>

        <Text>
          Override active:{" "}
          <Text style={{ fontWeight: "900" }}>
            {overrideActive ? "YES" : "NO"}
          </Text>
        </Text>

        <Text>Override until: {formatTime(overrideUntil)}</Text>
        <Text>Cooldown until: {formatTime(cooldownUntil)}</Text>

        <Pressable
          onPress={activateOverride}
          disabled={mode !== "real" || inCooldown}
          style={{
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: mode !== "real" || inCooldown ? "#ddd" : "#111",
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            {mode !== "real"
              ? "Switch to Real to use override"
              : inCooldown
              ? "Override in cooldown (24h)"
              : "Activate Override (1 hour)"}
          </Text>
        </Pressable>
      </View>

      {/* ✅ Discipline Rules (Step 24) */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 18 }}>Discipline Rules</Text>
        <Text style={{ color: "#666" }}>
          These rules only apply in REAL mode. Plan is a hard gate. Closeout is a warning (soft).
        </Text>

        <Row>
          <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
            <Text style={{ fontWeight: "800" }}>Require Daily Plan (hard)</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontWeight: "800" }}>Off</Text>
              <Switch
                value={requireDailyPlan}
                onValueChange={setRequireDailyPlan}
              />
              <Text style={{ fontWeight: "800" }}>On</Text>
            </View>
          </View>

          <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
            <Text style={{ fontWeight: "800" }}>Require Closeout (soft)</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontWeight: "800" }}>Off</Text>
              <Switch
                value={requireDailyCloseout}
                onValueChange={setRequireDailyCloseout}
              />
              <Text style={{ fontWeight: "800" }}>On</Text>
            </View>
          </View>
        </Row>

        <Label label="Max trades per day" />
        <TextInput
          value={maxTradesPerDay}
          onChangeText={setMaxTradesPerDay}
          placeholder="3"
          keyboardType="numeric"
          style={inputStyle}
        />

        <Label label="Max daily loss (R) (e.g. 2 means lock at -2R)" />
        <TextInput
          value={maxDailyLossR}
          onChangeText={setMaxDailyLossR}
          placeholder="2"
          keyboardType="numeric"
          style={inputStyle}
        />

        <Label label="Max consecutive losses (e.g. 2)" />
        <TextInput
          value={maxConsecutiveLosses}
          onChangeText={setMaxConsecutiveLosses}
          placeholder="2"
          keyboardType="numeric"
          style={inputStyle}
        />

        <Pressable
          onPress={saveRules}
          disabled={loading || rulesSaveState === "saving"}
          style={{
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: rulesButtonBg,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            {loading ? "Loading…" : rulesButtonText}
          </Text>
        </Pressable>

        <Pressable
          onPress={resetRulesDefaults}
          style={{
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#ddd",
          }}
        >
          <Text style={{ fontWeight: "900" }}>Reset to Defaults</Text>
        </Pressable>
      </View>

      {/* Strategy Manager */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 18 }}>
          Strategy Manager
        </Text>

        <Text style={{ color: "#666" }}>
          Add your Gold/US30 strategies with clear descriptions + checklists.
          This is what makes you trade like a machine.
        </Text>

        <Label label="Strategy name" />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. S/R + Supertrend Bias"
          style={inputStyle}
        />

        <Label label="Market" />
        <Row>
          <Chip
            text="Gold"
            active={market === "gold"}
            onPress={() => setMarket("gold")}
          />
          <Chip
            text="US30"
            active={market === "us30"}
            onPress={() => setMarket("us30")}
          />
          <Chip
            text="Both"
            active={market === "both"}
            onPress={() => setMarket("both")}
          />
        </Row>

        <Label label="Style tags (comma separated)" />
        <TextInput
          value={styleTags}
          onChangeText={setStyleTags}
          placeholder="scalp,intraday,swing"
          style={inputStyle}
        />

        <Label label="Timeframes" />
        <TextInput
          value={timeframes}
          onChangeText={setTimeframes}
          placeholder="M5,M15,H1"
          style={inputStyle}
        />

        <Label label="Description (how to use)" />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Explain the setup, entry trigger, stop logic, exit rules…"
          style={[inputStyle, { height: 110, textAlignVertical: "top" }]}
          multiline
        />

        <Label label="Checklist (one rule per line)" />
        <TextInput
          value={checklist}
          onChangeText={setChecklist}
          placeholder={"Bias confirmed\nEntry at level\nStop defined\nTP defined"}
          style={[inputStyle, { height: 110, textAlignVertical: "top" }]}
          multiline
        />

        <Label label="Optional image URL (visual example)" />
        <TextInput
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder="https://…"
          style={inputStyle}
          autoCapitalize="none"
        />

        {imageUrl.trim().length > 8 ? (
          <View style={{ marginTop: 6, gap: 6 }}>
            <Text style={{ color: "#666" }}>Preview:</Text>
            <Image
              source={{ uri: imageUrl.trim() }}
              style={{
                width: "100%",
                height: 180,
                borderRadius: 12,
                backgroundColor: "#f2f2f2",
              }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <Pressable
          onPress={createStrategy}
          disabled={!canSaveStrategy}
          style={{
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: canSaveStrategy ? "#111" : "#ddd",
            marginTop: 6,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            Create Strategy
          </Text>
        </Pressable>
      </View>

      {/* Strategy List + Stats */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "900" }}>
          Your Strategies ({strategies.length})
        </Text>

        {strategies.length === 0 ? (
          <Text style={{ color: "#666" }}>
            Add your first strategy above. Then log trades using that strategy.
          </Text>
        ) : null}

        {strategies.map((s) => {
          const st = statsById[s.id];
          const tradeCount = st?.tradeCount ?? 0;
          const winRate = st?.winRate ?? 0;
          const avgR = st?.avgR ?? 0;
          const totalR = st?.totalR ?? 0;

          return (
            <Pressable
              key={s.id}
              onPress={() =>
                router.push({
                  pathname: "/strategy/[id]",
                  params: { id: s.id },
                })
              }
              style={{
                borderWidth: 1,
                borderColor: "#eee",
                borderRadius: 14,
                padding: 12,
                gap: 8,
              }}
            >
              <Text style={{ fontWeight: "900", fontSize: 16 }}>{s.name}</Text>
              <Text style={{ color: "#666" }}>
                Market: {s.market.toUpperCase()} • Tags: {s.styleTags || "—"} •
                TF: {s.timeframes || "—"}
              </Text>

              {s.description ? (
                <Text style={{ color: "#333" }}>{s.description}</Text>
              ) : null}

              {s.checklist ? (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontWeight: "900" }}>Checklist</Text>
                  {s.checklist
                    .split("\n")
                    .slice(0, 5)
                    .map((line, i) => (
                      <Text key={i}>• {line}</Text>
                    ))}
                </View>
              ) : null}

              <View
                style={{ height: 1, backgroundColor: "#eee", marginTop: 6 }}
              />

              <Text style={{ fontWeight: "900" }}>
                Performance (from your logs)
              </Text>
              <Text style={{ color: "#666" }}>
                Trades: {tradeCount} • Win rate: {pct(winRate)} • Avg R:{" "}
                {avgR.toFixed(2)} • Total R: {totalR.toFixed(2)}
              </Text>

              {/* Delete button - prevent navigation */}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  removeStrategy(s.id);
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ddd",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <Text style={{ fontWeight: "900" }}>Delete Strategy</Text>
              </Pressable>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={refresh}
        style={{
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ddd",
          alignItems: "center",
          marginTop: 8,
        }}
      >
        <Text style={{ fontWeight: "900" }}>
          {loading ? "Refreshing…" : "Refresh"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Label({ label }: { label: string }) {
  return <Text style={{ fontWeight: "800" }}>{label}</Text>;
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
