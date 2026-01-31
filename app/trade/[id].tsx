import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    deleteTrade,
    getTradeById,
    TradeRow,
    updateTradeNotes,
    updateTradeTags,
} from "~/db/db";

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

const TAG_OPTIONS = [
  { key: "A_PLUS", label: "A+ Setup" },
  { key: "MISTAKE", label: "Mistake" },
  { key: "FOMO", label: "FOMO" },
  { key: "REVENGE", label: "Revenge" },
] as const;

type TagKey = (typeof TAG_OPTIONS)[number]["key"];

function parseTagsCsv(tags: string): TagKey[] {
  const raw = (tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const valid = new Set<TagKey>(TAG_OPTIONS.map((t) => t.key));
  return raw.filter((t): t is TagKey => valid.has(t as TagKey));
}

function toTagsCsv(tags: TagKey[]) {
  return Array.from(new Set(tags)).join(",");
}

export default function TradeDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = useMemo(() => String(params?.id || ""), [params]);

  const [loading, setLoading] = useState(true);
  const [trade, setTrade] = useState<TradeRow | null>(null);

  // ✅ Step 19 tags saving state
  const [savingTags, setSavingTags] = useState(false);

  // ✅ Step 20 notes editor
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const selectedTags = useMemo(() => {
    if (!trade) return [];
    return parseTagsCsv(trade.tags || "");
  }, [trade]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!id) {
        setTrade(null);
        return;
      }
      const t = await getTradeById(id);
      setTrade(t);

      if (t && !isEditingNotes) {
        setNotesDraft(t.notes ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [id, isEditingNotes]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function confirmDelete() {
    if (!trade) return;

    Alert.alert("Delete trade?", "This will permanently delete this trade.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTrade(trade.id);
          router.back();
        },
      },
    ]);
  }

  async function toggleTag(tag: TagKey) {
    if (!trade) return;
    if (savingTags) return;

    const current = parseTagsCsv(trade.tags || "");
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];

    const csv = toTagsCsv(next);

    setTrade({ ...trade, tags: csv });
    setSavingTags(true);
    try {
      await updateTradeTags(trade.id, csv);
    } catch (e) {
      console.warn("updateTradeTags failed:", e);
      await refresh();
    } finally {
      setSavingTags(false);
    }
  }

  function startEditNotes() {
    if (!trade) return;
    setNotesDraft(trade.notes ?? "");
    setIsEditingNotes(true);
  }

  function cancelEditNotes() {
    if (!trade) {
      setIsEditingNotes(false);
      setNotesDraft("");
      return;
    }
    setNotesDraft(trade.notes ?? "");
    setIsEditingNotes(false);
  }

  async function saveNotes() {
    if (!trade) return;
    if (savingNotes) return;

    const next = notesDraft ?? "";

    setSavingNotes(true);
    try {
      await updateTradeNotes(trade.id, next);
      setTrade({ ...trade, notes: next });
      setIsEditingNotes(false);
    } catch (e) {
      console.warn("updateTradeNotes failed:", e);
      Alert.alert("Could not save notes", "Please try again.");
      await refresh();
    } finally {
      setSavingNotes(false);
    }
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

      {/* ✅ Tags (Step 19) */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 8,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ fontWeight: "900" }}>Tags</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TAG_OPTIONS.map((t) => {
            const active = selectedTags.includes(t.key);
            return (
              <Pressable
                key={t.key}
                onPress={() => toggleTag(t.key)}
                disabled={savingTags}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? "#111" : "#ddd",
                  backgroundColor: active ? "#111" : "white",
                  opacity: savingTags ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: active ? "white" : "#111",
                    fontWeight: "900",
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: "#666" }}>
          {savingTags ? "Saving…" : "Tap to toggle tags."}
        </Text>
      </View>

      {/* ✅ Notes editor (Step 20) */}
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
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Notes</Text>

          {!isEditingNotes ? (
            <Pressable
              onPress={startEditNotes}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#ddd",
                backgroundColor: "white",
              }}
            >
              <Text style={{ fontWeight: "900" }}>Edit</Text>
            </Pressable>
          ) : (
            <Text style={{ color: "#666", fontWeight: "900" }}>
              {savingNotes ? "Saving…" : "Editing"}
            </Text>
          )}
        </View>

        {!isEditingNotes ? (
          <Text style={{ color: "#333" }}>
            {trade.notes?.trim() ? trade.notes.trim() : "—"}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="Write what happened, why, and what you improve next time…"
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
              editable={!savingNotes}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={saveNotes}
                disabled={savingNotes}
                style={{
                  flex: 1,
                  backgroundColor: "#111",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: savingNotes ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>
                  Save Notes
                </Text>
              </Pressable>

              <Pressable
                onPress={cancelEditNotes}
                disabled={savingNotes}
                style={{
                  borderWidth: 1,
                  borderColor: "#ddd",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: savingNotes ? 0.6 : 1,
                }}
              >
                <Text style={{ fontWeight: "900" }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
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
