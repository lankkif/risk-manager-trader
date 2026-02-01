import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  getDailyCloseout,
  getSetting,
  hasDailyCloseout,
  upsertDailyCloseout,
} from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

type SaveState = "idle" | "saving" | "saved";

export default function CloseoutTab() {
  const key = useMemo(() => todayKey(), []);
  const [loading, setLoading] = useState(true);

  const [saved, setSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const [bias, setBias] = useState("");
  const [newsCaution, setNewsCaution] = useState(false);
  const [mood, setMood] = useState(3);

  const [mistakes, setMistakes] = useState("");
  const [wins, setWins] = useState("");
  const [improvement, setImprovement] = useState("");
  const [executionGrade, setExecutionGrade] = useState("");

  const [mode, setMode] = useState<"demo" | "real">("demo");

  // ✅ Save feedback + dirty tracking (Saved stays until next edit)
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback(() => {
    setDirty(true);
    if (saveState === "saved") setSaveState("idle");
  }, [saveState]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const appMode = await getSetting("appMode");
      setMode(appMode === "real" ? "real" : "demo");

      const has = await hasDailyCloseout(key);
      setSaved(has);

      const row = await getDailyCloseout(key);
      if (row) {
        setBias(row.bias ?? "");
        setNewsCaution(!!row.newsCaution);
        setMood(typeof row.mood === "number" ? row.mood : 3);
        setMistakes(row.mistakes ?? "");
        setWins(row.wins ?? "");
        setImprovement(row.improvement ?? "");
        setExecutionGrade(row.executionGrade ?? "");
        setLastSavedAt(row.createdAt ?? null);

        // ✅ Default to Saved ✅ (until user edits)
        setSaveState("saved");
        setDirty(false);
      } else {
        // Fresh day: keep defaults, not saved yet
        setBias("");
        setNewsCaution(false);
        setMood(3);
        setMistakes("");
        setWins("");
        setImprovement("");
        setExecutionGrade("");
        setLastSavedAt(null);

        setSaveState("idle");
        setDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const canSave = useMemo(() => {
    if (loading) return false;
    if (saveState === "saving") return false;
    // ✅ allow saving if it's not saved yet OR you changed something
    if (!saved) return true;
    return dirty;
  }, [loading, saveState, saved, dirty]);

  async function save() {
    if (!canSave) return;
    if (saveState === "saving") return;

    setSaveState("saving");

    try {
      await upsertDailyCloseout(key, {
        bias: bias.trim(),
        newsCaution,
        mood,
        mistakes: mistakes.trim(),
        wins: wins.trim(),
        improvement: improvement.trim(),
        executionGrade: executionGrade.trim(),
      });

      const now = Date.now();
      setSaved(true);
      setLastSavedAt(now);

      // ✅ Saved stays until user edits again
      setSaveState("saved");
      setDirty(false);
    } catch (e) {
      console.warn("Save closeout failed:", e);
      setSaveState("idle");
    }
  }

  const isSavedNow = saveState === "saved" && !dirty;

  const headerBorder = isSavedNow ? "#b7f7c1" : saved ? "#ffd38a" : "#ffd38a";
  const headerBg = isSavedNow ? "#f2fff4" : "#fff7ea";

  const buttonText =
    saveState === "saving"
      ? "Saving…"
      : isSavedNow
      ? "Saved ✅"
      : "Save Closeout";

  const buttonBg = isSavedNow ? "#0a7a2f" : canSave ? "#111" : "#bbb";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 160 }}
      showsVerticalScrollIndicator
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Closeout</Text>

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
          {isSavedNow ? "✅ Closeout complete" : "⚠ Closeout not done"}
        </Text>

        <Text style={{ color: "#666" }}>
          Mode: <Text style={{ fontWeight: "900" }}>{mode.toUpperCase()}</Text> •
          Day: <Text style={{ fontWeight: "900" }}>{key}</Text>
          {lastSavedAt ? (
            <>
              {" "}
              • Last saved:{" "}
              <Text style={{ fontWeight: "900" }}>{fmtTime(lastSavedAt)}</Text>
            </>
          ) : null}
        </Text>

        <Text style={{ color: "#666" }}>
          You will NOT be locked out. In Real mode, missing closeout is a warning
          (and can be logged as a rule break later).
        </Text>

        <Text style={{ color: isSavedNow ? "#0a7a2f" : "#666", fontWeight: "900" }}>
          {loading
            ? "Loading…"
            : saveState === "saving"
            ? "Saving…"
            : isSavedNow
            ? "Saved ✅"
            : "Not saved"}
        </Text>
      </View>

      <Text style={{ fontWeight: "900" }}>Bias (how you traded)</Text>
      <TextInput
        value={bias}
        onChangeText={(v) => {
          markDirty();
          setBias(v);
        }}
        placeholder="Bull / Bear / Neutral + why"
        style={inputStyle}
      />

      <Text style={{ fontWeight: "900" }}>News caution today?</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip
          text="No"
          active={!newsCaution}
          onPress={() => {
            markDirty();
            setNewsCaution(false);
          }}
        />
        <Chip
          text="Yes"
          active={newsCaution}
          onPress={() => {
            markDirty();
            setNewsCaution(true);
          }}
        />
      </View>

      <Text style={{ fontWeight: "900" }}>Mood (1–5)</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip
            key={n}
            text={String(n)}
            active={mood === n}
            onPress={() => {
              markDirty();
              setMood(n);
            }}
          />
        ))}
      </View>

      <Text style={{ fontWeight: "900" }}>Mistakes</Text>
      <TextInput
        value={mistakes}
        onChangeText={(v) => {
          markDirty();
          setMistakes(v);
        }}
        placeholder="chased, moved SL, revenge trade, ignored level…"
        style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
        multiline
      />

      <Text style={{ fontWeight: "900" }}>Wins</Text>
      <TextInput
        value={wins}
        onChangeText={(v) => {
          markDirty();
          setWins(v);
        }}
        placeholder="waited for setup, respected risk, stopped after limit…"
        style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
        multiline
      />

      <Text style={{ fontWeight: "900" }}>1 improvement for tomorrow</Text>
      <TextInput
        value={improvement}
        onChangeText={(v) => {
          markDirty();
          setImprovement(v);
        }}
        placeholder="One thing only. Practical + measurable."
        style={[inputStyle, { height: 80, textAlignVertical: "top" }]}
        multiline
      />

      <Text style={{ fontWeight: "900" }}>Execution grade (A–F)</Text>
      <TextInput
        value={executionGrade}
        onChangeText={(v) => {
          markDirty();
          setExecutionGrade(v);
        }}
        placeholder="A / B / C / D / F"
        style={inputStyle}
      />

      <Pressable
        onPress={save}
        disabled={!canSave}
        style={{
          backgroundColor: buttonBg,
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 6,
          opacity: loading || saveState === "saving" ? 0.7 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>
          {loading ? "Loading…" : buttonText}
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
        <Text style={{ fontWeight: "900" }}>{loading ? "…" : "Refresh"}</Text>
      </Pressable>
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

const inputStyle = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  padding: 12,
  backgroundColor: "white",
} as const;
