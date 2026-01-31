import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { deleteTrade, getTradeById, TradeRow } from "~/db/db";

function fmtTime(ms: number) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function shortId(id: string, n = 8) {
  const s = String(id || "");
  return s.length > n ? s.slice(0, n) : s;
}

function displayStrategyName(t: TradeRow) {
  const name = (t.strategyName || "").trim();
  if (name) return name;
  const id = (t.strategyId || "").trim();
  return id ? `Strategy ${shortId(id)}` : "No Strategy";
}

export default function TradeDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = useMemo(() => String(params?.id || ""), [params]);

  const [loading, setLoading] = useState(true);
  const [trade, setTrade] = useState<TradeRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!id) {
        setTrade(null);
        return;
      }
      const t = await getTradeById(id);
      setTrade(t);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function confirmDelete() {
    if (!trade) return;

    Alert.alert(
      "Delete trade?",
      "This will permanently delete this trade.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTrade(trade.id);
            router.back();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
        <Text style={{ fontSize: 20, fontWeight: "900" }}>Loading…</Text>
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white", gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>Trade not found</Text>
        <Pressable
          onPress={() => router.back()}
          style={{
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "900" }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isWin = trade.resultR > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Trade Details</Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 18 }}>
          {displayStrategyName(trade)}
        </Text>
        <Text style={{ color: "#666" }}>{fmtTime(trade.createdAt)}</Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "#666" }}>
            {trade.session || "—"} • {trade.timeframe || "—"} •{" "}
            {trade.bias || "—"}
          </Text>

          <Text
            style={{
              fontWeight: "900",
              fontSize: 18,
              color: isWin ? "#0a7a2f" : "#b00020",
            }}
          >
            {trade.resultR >= 0 ? "+" : ""}
            {trade.resultR.toFixed(2)}R
          </Text>
        </View>

        {trade.ruleBreaks?.trim() ? (
          <Text style={{ color: "#b26a00", fontWeight: "900" }}>
            ⚠ Rule breaks: {trade.ruleBreaks}
          </Text>
        ) : null}
      </View>

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
        <Text style={{ fontWeight: "900" }}>Notes</Text>
        <Text style={{ color: "#333" }}>
          {trade.notes?.trim() ? trade.notes.trim() : "—"}
        </Text>
      </View>

      <Pressable
        onPress={confirmDelete}
        style={{
          backgroundColor: "#b00020",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>Delete Trade</Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}
