import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  deleteStrategy,
  getStrategyStats,
  listStrategies,
  Strategy,
  StrategyMarket,
  upsertStrategy,
} from "~/db/db";

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

export default function AdminTab() {
  const [loading, setLoading] = useState(true);

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
    }, [refresh])
  );

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 50 }}
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Admin</Text>

      {/* ✅ Admin Scope Note */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 8,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Admin Scope</Text>
        <Text style={{ color: "#666" }}>
          This tab is for managing strategies and maintenance tools.
        </Text>
        <Text style={{ color: "#666" }}>
          Mode (Demo/Real), Override, and Discipline Rules live in{" "}
          <Text style={{ fontWeight: "900" }}>Rules</Text>.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/settings")}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: "#111",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>Go to Rules</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/dashboard")}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ddd",
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Go to Status</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/insights")}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ddd",
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Go to Insights</Text>
          </Pressable>
        </View>
      </View>

      {/* ✅ Strategy Manager */}
      <View
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          gap: 12,
        }}
      >
        <Text style={{ fontWeight: "900", fontSize: 16 }}>Strategy Manager</Text>

        {/* Create strategy */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "900" }}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Asia Sweep + EQ Retest"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />

          <Text style={{ fontWeight: "900" }}>Market</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {(["gold", "us30", "both"] as StrategyMarket[]).map((m) => {
              const active = m === market;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMarket(m)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#111" : "#ddd",
                    backgroundColor: active ? "#111" : "white",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "900",
                      color: active ? "white" : "#111",
                    }}
                  >
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ fontWeight: "900" }}>Tags</Text>
          <TextInput
            value={styleTags}
            onChangeText={setStyleTags}
            placeholder="intraday, trend, scalps"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />

          <Text style={{ fontWeight: "900" }}>Timeframes</Text>
          <TextInput
            value={timeframes}
            onChangeText={setTimeframes}
            placeholder="M5,M15,H1"
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />

          <Text style={{ fontWeight: "900" }}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What makes this setup valid?"
            multiline
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
              minHeight: 90,
              textAlignVertical: "top",
            }}
          />

          <Text style={{ fontWeight: "900" }}>Checklist</Text>
          <TextInput
            value={checklist}
            onChangeText={setChecklist}
            placeholder="One item per line…"
            multiline
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
              minHeight: 110,
              textAlignVertical: "top",
            }}
          />

          <Text style={{ fontWeight: "900" }}>Image URL (optional)</Text>
          <TextInput
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="https://..."
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "white",
            }}
          />

          {imageUrl.trim() ? (
            <Image
              source={{ uri: imageUrl.trim() }}
              style={{
                width: "100%",
                height: 180,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#eee",
              }}
              resizeMode="cover"
            />
          ) : null}

          <Pressable
            onPress={createStrategy}
            disabled={!canSaveStrategy}
            style={{
              padding: 14,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: canSaveStrategy ? "#111" : "#ddd",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              Create Strategy
            </Text>
          </Pressable>
        </View>

        <View style={{ height: 1, backgroundColor: "#eee" }} />

        {/* List strategies */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: "900" }}>
            Existing strategies ({strategies.length})
          </Text>

          {loading ? (
            <Text style={{ color: "#666" }}>Loading…</Text>
          ) : strategies.length === 0 ? (
            <Text style={{ color: "#666" }}>No strategies yet.</Text>
          ) : (
            strategies.map((s) => {
              const st = statsById[s.id];
              const count = st?.count ?? 0;
              const sumR = st?.sumR ?? 0;
              const wins = st?.wins ?? 0;
              const winRate = count > 0 ? wins / count : 0;

              return (
                <View
                  key={s.id}
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
                    Market:{" "}
                    <Text style={{ fontWeight: "900" }}>{s.market.toUpperCase()}</Text>{" "}
                    • Tags: {s.styleTags || "—"} • TF: {s.timeframes || "—"}
                  </Text>

                  <Text style={{ color: "#666" }}>
                    Trades: <Text style={{ fontWeight: "900" }}>{count}</Text> • Total
                    R: <Text style={{ fontWeight: "900" }}>{sumR.toFixed(2)}</Text> •
                    Win: <Text style={{ fontWeight: "900" }}>{pct(winRate)}</Text>
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/strategy/[id]",
                          params: { id: s.id },
                        })
                      }
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor: "#111",
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "900" }}>View</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => removeStrategy(s.id)}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: "#ddd",
                        backgroundColor: "white",
                      }}
                    >
                      <Text style={{ fontWeight: "900" }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}
