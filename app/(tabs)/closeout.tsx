import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { getSetting, hasDailyCloseout, upsertDailyCloseout } from "~/db/db";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CloseoutTab() {
  const key = useMemo(() => todayKey(), []);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [bias, setBias] = useState("");
  const [newsCaution, setNewsCaution] = useState(false);
  const [mood, setMood] = useState(3);

  const [mistakes, setMistakes] = useState("");
  const [wins, setWins] = useState("");
  const [improvement, setImprovement] = useState("");
  const [executionGrade, setExecutionGrade] = useState("");

  const [mode, setMode] = useState<"demo" | "real">("demo");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const appMode = await getSetting("appMode");
      setMode(appMode === "real" ? "real" : "demo");

      const has = await hasDailyCloseout(key);
      setSaved(has);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function save() {
    await upsertDailyCloseout(key, {
      bias,
      newsCaution,
      mood,
      mistakes,
      wins,
      improvement,
      executionGrade,
    });
    setSaved(true);
  }

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
          borderColor: saved ? "#b7f7c1" : "#ffd38a",
          backgroundColor: saved ? "#f2fff4" : "#fff7ea",
          borderRadius: 14,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "900" }}>
          {saved ? "✅ Closeout complete" : "⚠ Closeout not done"}
        </Text>
        <Text style={{ color: "#666" }}>
          Mode: <Text style={{ fontWeight: "900" }}>{mode.toUpperCase()}</Text> •
          Day: <Text style={{ fontWeight: "900" }}>{key}</Text>
        </Text>
        <Text style={{ color: "#666" }}>
          You will NOT be locked out. In Real mode, missing closeout is a warning
          (and can be logged as a rule break).
        </Text>
      </View>

      <Text style={{ fontWeight: "900" }}>Bias (how you traded)</Text>
      <TextInput
        value={bias}
        onChangeText={setBias}
        placeholder="Bull / Bear / Neutral + why"
        style={inputStyle}
      />

      <Text style={{ fontWeight: "900" }}>News caution today?</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip text="No" active={!newsCaution} onPress={() => setNewsCaution(false)} />
        <Chip text="Yes" active={newsCaution} onPress={() => setNewsCaution(true)} />
      </View>

      <Text style={{ fontWeight: "900" }}>Mood (1–5)</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip key={n} text={String(n)} active={mood === n} onPress={() => setMood(n)} />
        ))}
      </View>

      <Text style={{ fontWeight: "900" }}>Mistakes</Text>
      <TextInput
        value={mistakes}
        onChangeText={setMistakes}
        placeholder="chased, moved SL, revenge trade, ignored level…"
        style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
        multiline
      />

      <Text style={{ fontWeight: "900" }}>Wins</Text>
      <TextInput
        value={wins}
        onChangeText={setWins}
        placeholder="waited for setup, respected risk, stopped after limit…"
        style={[inputStyle, { height: 90, textAlignVertical: "top" }]}
        multiline
      />

      <Text style={{ fontWeight: "900" }}>1 improvement for tomorrow</Text>
      <TextInput
        value={improvement}
        onChangeText={setImprovement}
        placeholder="One thing only. Practical + measurable."
        style={[inputStyle, { height: 80, textAlignVertical: "top" }]}
        multiline
      />

      <Text style={{ fontWeight: "900" }}>Execution grade (A–F)</Text>
      <TextInput
        value={executionGrade}
        onChangeText={setExecutionGrade}
        placeholder="A / B / C / D / F"
        style={inputStyle}
      />

      <Pressable
        onPress={save}
        style={{
          backgroundColor: "#111",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>Save Closeout</Text>
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
