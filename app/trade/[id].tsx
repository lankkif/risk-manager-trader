import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { parseRuleBreaks, ruleBreakLabel } from "~/constants/ruleBreaks";
import {
  deleteTrade,
  getTradeById,
  updateTradeNotes,
  updateTradeTags,
} from "~/db/db";

function formatDateTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString();
}

function badgeColor(value: number) {
  if (value > 0) return { bg: "rgba(0,180,120,0.12)", fg: "#0b7a52" };
  if (value < 0) return { bg: "rgba(220,60,60,0.12)", fg: "#b00020" };
  return { bg: "rgba(0,0,0,0.08)", fg: "#111" };
}

export default function TradeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [trade, setTrade] = useState<any | null>(null);

  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await getTradeById(String(id));
      setTrade(t);
      setNotes(t?.notes ?? "");
      setTags(t?.tags ?? "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const ruleBreaks = useMemo(() => {
    return parseRuleBreaks(trade?.ruleBreaks ?? "");
  }, [trade?.ruleBreaks]);

  async function saveNotes() {
    if (!id) return;
    await updateTradeNotes(String(id), notes);
    await load();
  }

  async function saveTags() {
    if (!id) return;
    await updateTradeTags(String(id), tags);
    await load();
  }

  async function removeTrade() {
    if (!id) return;

    Alert.alert(
      "Delete trade?",
      "This will permanently delete this trade.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTrade(String(id));
            router.back();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", padding: 16 }}>
        <Text style={{ fontSize: 16, color: "#666" }}>Loading…</Text>
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "900" }}>Trade not found</Text>
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: "#111",
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const rStyle = badgeColor(Number(trade.resultR ?? 0));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 24, fontWeight: "900" }}>Trade</Text>
        <Text style={{ color: "#666" }}>{formatDateTime(trade.createdAt)}</Text>
      </View>

      {/* Summary */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: rStyle.bg,
            }}
          >
            <Text style={{ fontWeight: "900", color: rStyle.fg }}>
              {Number(trade.resultR).toFixed(2)}R
            </Text>
          </View>

          <Text style={{ color: "#666" }}>
            Risk:{" "}
            <Text style={{ fontWeight: "900" }}>
              {trade.riskR == null ? "—" : `${Number(trade.riskR).toFixed(2)}R`}
            </Text>
          </Text>
        </View>

        <Text style={{ color: "#666" }}>
          Strategy:{" "}
          <Text style={{ fontWeight: "900" }}>
            {trade.strategyName || trade.strategyId || "—"}
          </Text>
        </Text>

        <Text style={{ color: "#666" }}>
          Session:{" "}
          <Text style={{ fontWeight: "900" }}>{trade.session || "—"}</Text> • TF:{" "}
          <Text style={{ fontWeight: "900" }}>{trade.timeframe || "—"}</Text>
        </Text>

        <Text style={{ color: "#666" }}>
          Bias: <Text style={{ fontWeight: "900" }}>{trade.bias || "—"}</Text>
        </Text>
      </View>

      {/* Rule breaks */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Rule breaks</Text>

        {ruleBreaks.length === 0 ? (
          <Text style={{ color: "#666" }}>None ✅</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ruleBreaks.map((code) => (
              <View
                key={code}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,165,0,0.16)",
                  borderWidth: 1,
                  borderColor: "rgba(255,165,0,0.35)",
                }}
              >
                <Text style={{ fontWeight: "900", color: "#8a4b00" }}>
                  {ruleBreakLabel(code)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Tags */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Tags</Text>
        <Text style={{ color: "#666" }}>
          Comma separated. Example: sweep, fomo, news, A+
        </Text>

        <TextInput
          value={tags}
          onChangeText={setTags}
          placeholder="e.g. sweep, A+, london"
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "white",
          }}
        />

        <Pressable
          onPress={saveTags}
          style={{
            backgroundColor: "#111",
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>Save tags</Text>
        </Pressable>
      </View>

      {/* Notes */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Notes</Text>

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="What happened? What did you do well or badly?"
          multiline
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            padding: 12,
            minHeight: 120,
            backgroundColor: "white",
            textAlignVertical: "top",
          }}
        />

        <Pressable
          onPress={saveNotes}
          style={{
            backgroundColor: "#111",
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>Save notes</Text>
        </Pressable>
      </View>

      {/* Danger zone */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#ffd6d6",
          borderRadius: 14,
          padding: 14,
          gap: 10,
          backgroundColor: "rgba(255,0,0,0.03)",
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16, color: "#b00020" }}>
          Danger zone
        </Text>

        <Pressable
          onPress={removeTrade}
          style={{
            padding: 14,
            borderRadius: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#ffb3b3",
            backgroundColor: "white",
          }}
        >
          <Text style={{ fontWeight: "900", color: "#b00020" }}>
            Delete trade
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
