import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
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

type SaveState = "idle" | "saving" | "saved";

function parseCsv(s: string) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeTag(t: string) {
  // light normalization so Insights stays consistent
  // (won't be too aggressive: only trims + collapses spaces)
  const clean = String(t || "").trim();
  if (!clean) return "";
  return clean.replace(/\s+/g, "_").toUpperCase();
}

function uniqueTags(tags: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const k = normalizeTag(t);
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function toTagsCsv(tags: string[]) {
  return uniqueTags(tags).join(",");
}

const TAG_CHIPS = [
  { key: "A_PLUS", label: "A+ Setup" },
  { key: "MISTAKE", label: "Mistake" },
  { key: "FOMO", label: "FOMO" },
  { key: "REVENGE", label: "Revenge" },

  // extra helpful tags (optional)
  { key: "FOLLOWED_PLAN", label: "Followed Plan" },
  { key: "PATIENCE", label: "Patience" },
  { key: "OVERTRADING", label: "Overtrading" },
  { key: "LATE_ENTRY", label: "Late Entry" },
  { key: "EARLY_ENTRY", label: "Early Entry" },
] as const;

type Template = {
  label: string;
  addTags: string[]; // normalized later
  noteLine: string;
};

const MISTAKE_TEMPLATES: Template[] = [
  {
    label: "Moved stop loss",
    addTags: ["MISTAKE"],
    noteLine: "Mistake: moved stop loss (broke rules).",
  },
  {
    label: "Entered too early",
    addTags: ["MISTAKE", "EARLY_ENTRY"],
    noteLine: "Mistake: entered too early (no confirmation).",
  },
  {
    label: "Chased candle",
    addTags: ["MISTAKE", "FOMO"],
    noteLine: "Mistake: chased candle (FOMO entry).",
  },
  {
    label: "Revenge trade",
    addTags: ["MISTAKE", "REVENGE"],
    noteLine: "Mistake: revenge trade (emotion-driven).",
  },
  {
    label: "Overtraded",
    addTags: ["MISTAKE", "OVERTRADING"],
    noteLine: "Mistake: overtraded (should have stopped).",
  },
  {
    label: "Ignored key level",
    addTags: ["MISTAKE"],
    noteLine: "Mistake: ignored a key level / context.",
  },
];

const APLUS_TEMPLATES: Template[] = [
  {
    label: "A+ at level + confirmation",
    addTags: ["A_PLUS", "FOLLOWED_PLAN"],
    noteLine: "A+: level + confirmation + clean execution.",
  },
  {
    label: "Waited for patience entry",
    addTags: ["A_PLUS", "PATIENCE"],
    noteLine: "A+: waited patiently for best entry.",
  },
  {
    label: "Stopped after limit",
    addTags: ["FOLLOWED_PLAN", "PATIENCE"],
    noteLine: "Win: respected limits (stopped trading on time).",
  },
];

const QUICK_PROMPTS = [
  "Entry: ",
  "Stop: ",
  "Target: ",
  "Setup: ",
  "Emotion: ",
  "Lesson: ",
] as const;

export default function TradeDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = useMemo(() => String(params?.id || ""), [params]);

  const [loading, setLoading] = useState(true);
  const [trade, setTrade] = useState<TradeRow | null>(null);

  // ✅ Tags saving feedback
  const [savingTags, setSavingTags] = useState(false);
  const [tagsSaveState, setTagsSaveState] = useState<SaveState>("idle");
  const tagsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Notes editor
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // ✅ Tag input (custom tags)
  const [tagsDraft, setTagsDraft] = useState("");

  const selectedTags = useMemo(() => {
    if (!trade) return [];
    return uniqueTags(parseCsv(trade.tags || ""));
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

      if (t) {
        setTagsDraft(t.tags ?? "");
        if (!isEditingNotes) {
          setNotesDraft(t.notes ?? "");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id, isEditingNotes]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        if (tagsSaveTimer.current) {
          clearTimeout(tagsSaveTimer.current);
          tagsSaveTimer.current = null;
        }
      };
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

  function markTagsSaved() {
    setTagsSaveState("saved");
    if (tagsSaveTimer.current) clearTimeout(tagsSaveTimer.current);
    tagsSaveTimer.current = setTimeout(() => {
      setTagsSaveState("idle");
      tagsSaveTimer.current = null;
    }, 900);
  }

  async function saveTagsCsv(nextCsv: string) {
    if (!trade) return;
    if (savingTags) return;

    const cleaned = toTagsCsv(parseCsv(nextCsv));

    setSavingTags(true);
    setTagsSaveState("saving");

    // optimistic UI
    setTrade({ ...trade, tags: cleaned });
    setTagsDraft(cleaned);

    try {
      await updateTradeTags(trade.id, cleaned);
      markTagsSaved();
    } catch (e) {
      console.warn("updateTradeTags failed:", e);
      await refresh();
      setTagsSaveState("idle");
    } finally {
      setSavingTags(false);
    }
  }

  async function toggleTag(tag: string) {
    if (!trade) return;
    if (savingTags) return;

    const key = normalizeTag(tag);
    const current = uniqueTags(parseCsv(trade.tags || ""));
    const next = current.includes(key)
      ? current.filter((t) => t !== key)
      : [...current, key];

    await saveTagsCsv(toTagsCsv(next));
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

  function appendToNotes(line: string) {
    const l = String(line || "").trim();
    if (!l) return;

    // Ensure we're editing so user can still adjust
    if (!isEditingNotes) setIsEditingNotes(true);

    setNotesDraft((prev) => {
      const p = (prev || "").trimEnd();
      if (!p) return l;
      // add line break cleanly
      return `${p}\n${l}`;
    });
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

  async function applyTemplate(t: Template) {
    // 1) Add tags
    const tagAdd = uniqueTags(t.addTags);
    if (tagAdd.length) {
      const merged = uniqueTags([...selectedTags, ...tagAdd]);
      await saveTagsCsv(toTagsCsv(merged));
    }

    // 2) Add notes line
    appendToNotes(t.noteLine);
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

  const tagsStatusText =
    tagsSaveState === "saving"
      ? "Saving…"
      : tagsSaveState === "saved"
      ? "Saved ✅"
      : "Tap chips or add custom tags.";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "white" }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
      showsVerticalScrollIndicator
    >
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Trade Details</Text>

      {/* Header */}
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

      {/* ✅ Tags (Step 26 upgraded) */}
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
        <Text style={{ fontWeight: "900" }}>Tags</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TAG_CHIPS.map((t) => {
            const active = selectedTags.includes(normalizeTag(t.key));
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

        <Text style={{ fontWeight: "900", marginTop: 6 }}>
          Custom tags (comma separated)
        </Text>

        <TextInput
          value={tagsDraft}
          onChangeText={setTagsDraft}
          placeholder="e.g. NEWS, ASIA_SWEEP, EQ_LEVEL, LONDON_OPEN"
          autoCapitalize="characters"
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "white",
          }}
          editable={!savingTags}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => saveTagsCsv(tagsDraft)}
            disabled={savingTags}
            style={{
              flex: 1,
              backgroundColor: "#111",
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: "center",
              opacity: savingTags ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              Save Tags
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTagsDraft(trade.tags ?? "")}
            disabled={savingTags}
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: "center",
              opacity: savingTags ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "900" }}>Reset</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#666" }}>{tagsStatusText}</Text>
      </View>

      {/* ✅ One-tap templates */}
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
        <Text style={{ fontWeight: "900" }}>One-tap Templates</Text>
        <Text style={{ color: "#666" }}>
          Tap a template to add tags + auto-write into your notes. Then you can edit.
        </Text>

        <Text style={{ fontWeight: "900" }}>Mistake templates</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MISTAKE_TEMPLATES.map((t) => (
            <Pressable
              key={t.label}
              onPress={() => applyTemplate(t)}
              disabled={savingTags}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#ddd",
                backgroundColor: "white",
                opacity: savingTags ? 0.6 : 1,
              }}
            >
              <Text style={{ fontWeight: "900" }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: 8 }} />

        <Text style={{ fontWeight: "900" }}>A+ / discipline templates</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {APLUS_TEMPLATES.map((t) => (
            <Pressable
              key={t.label}
              onPress={() => applyTemplate(t)}
              disabled={savingTags}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#ddd",
                backgroundColor: "white",
                opacity: savingTags ? 0.6 : 1,
              }}
            >
              <Text style={{ fontWeight: "900" }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: 8 }} />

        <Text style={{ fontWeight: "900" }}>Quick note prompts</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {QUICK_PROMPTS.map((p) => (
            <Pressable
              key={p}
              onPress={() => appendToNotes(p)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#ddd",
                backgroundColor: "white",
              }}
            >
              <Text style={{ fontWeight: "900" }}>{p.trim()}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ✅ Notes editor */}
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
              placeholder="What happened, why, and what you improve next time…"
              multiline
              style={{
                minHeight: 120,
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
