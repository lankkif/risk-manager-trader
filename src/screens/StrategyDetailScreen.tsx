import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { listStrategies } from "~/db/db";

export default function StrategyDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState<any>(null);

  const id = useMemo(() => (params?.id ? String(params.id) : ""), [params]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await listStrategies();
        const found = all.find((s) => s.id === id) ?? null;
        setStrategy(found);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Loading…</Text>
      </View>
    );
  }

  if (!strategy) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: "white", gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>
          Strategy not found
        </Text>
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

  const checklistLines =
    (strategy.checklist || "")
      .split("\n")
      .map((x: string) => x.trim())
      .filter(Boolean) || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>{strategy.name}</Text>

      <Text style={{ color: "#666" }}>
        Market: {String(strategy.market).toUpperCase()} • Tags:{" "}
        {strategy.styleTags || "—"} • TF: {strategy.timeframes || "—"}
      </Text>

      {strategy.imageUrl ? (
        <Image
          source={{ uri: strategy.imageUrl }}
          style={{
            width: "100%",
            height: 220,
            borderRadius: 14,
            backgroundColor: "#f2f2f2",
          }}
          resizeMode="cover"
        />
      ) : null}

      {strategy.description ? (
        <Card title="How to use">
          <Text style={{ lineHeight: 20 }}>{strategy.description}</Text>
        </Card>
      ) : null}

      <Card title="Checklist">
        {checklistLines.length === 0 ? (
          <Text style={{ color: "#666" }}>No checklist added yet.</Text>
        ) : (
          <View style={{ gap: 6 }}>
            {checklistLines.map((line: string, idx: number) => (
              <Text key={idx}>• {line}</Text>
            ))}
          </View>
        )}
      </Card>

      <Pressable
        onPress={() => {
          // navigate to Trade tab and pass strategyId
          router.push({
            pathname: "/(tabs)/new-trade",
            params: { strategyId: strategy.id },
          });
        }}
        style={{
          backgroundColor: "#111",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>
          Use this strategy
        </Text>
      </Pressable>

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
        <Text style={{ fontWeight: "900" }}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 14,
        padding: 12,
        gap: 8,
      }}
    >
      <Text style={{ fontWeight: "900", fontSize: 16 }}>{title}</Text>
      {children}
    </View>
  );
}
