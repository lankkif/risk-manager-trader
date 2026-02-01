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
import { parseRuleBreaks, ruleBreakLabel } from "~/constants/ruleBreaks";
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
    noteLine: "Mistake: overtraded (took too many setups).",
  },
  {
    label: "Entered late",
    addTags: ["MISTAKE", "LATE_ENTRY"],
    noteLine: "Mistake: entered late (RR got worse).",
  },
];

function appendLine(base: string, line: string) {
  const b = String(base || "").trimEnd();
  const l = String(line || "").trim();
  if (!l) return b;
  if (!b) return l;
  return `${b}\n${l}`;
}

export default function TradeDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const [trade, setTrade] = useState<TradeRow | null>(null);
  const [loading, setLoading] = useState(true);

  // notes
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaveState, setNotesSaveState] = useState<SaveState>("idle");
  const notesTimer = useRef<any>(null);

  // tags
  const [tagsDraft, setTagsDraft] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagsSaveState, setTagsSaveState] = useState<SaveState>("idle");
  const tagsTimer = useRef<any>(null);

  const savingNotes = notesSaveState === "saving";
  const savingTags = tagsSaveState === "saving";

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await getTradeById(String(id));
      setTrade(t);

      const n = t?.notes || "";
      setNotesDraft(n);
      setNotesSaveState("idle");

      const tagsCsv = t?.tags || "";
      setTagsDraft(tagsCsv);
      const parsed = parseCsv(tagsCsv).map(normalizeTag);
      setSelectedTags(uniqueTags(parsed));
      setTagsSaveState("idle");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        if (notesTimer.current) clearTimeout(notesTimer.current);
        if (tagsTimer.current) clearTimeout(tagsTimer.current);
      };
    }, [refresh])
  );

  const setSavedSoon = useCallback((setter: (s: SaveState) => void) => {
    setter("saved");
    // go back to idle after a short time
    setTimeout(() => setter("idle"), 1200);
  }, []);

  const scheduleSaveNotes = useCallback(
    async (nextNotes: string) => {
      if (!id) return;

      if (notesTimer.current) clearTimeout(notesTimer.current);

      setNotesSaveState("saving");

      notesTimer.current = setTimeout(async () => {
        try {
          await updateTradeNotes(String(id), nextNotes);
          setSavedSoon(setNotesSaveState);
        } catch {
          setNotesSaveState("idle");
        }
      }, 350);
    },
    [id, setSavedSoon]
  );

  const scheduleSaveTags = useCallback(
    async (nextCsv: string) => {
      if (!id) return;

      if (tagsTimer.current) clearTimeout(tagsTimer.current);

      setTagsSaveState("saving");

      tagsTimer.current = setTimeout(async () => {
        try {
          await updateTradeTags(String(id), nextCsv);
          setSavedSoon(setTagsSaveState);
        } catch {
          setTagsSaveState("idle");
        }
      }, 350);
    },
    [id, setSavedSoon]
  );

  const saveTagsCsv = useCallback(
    (csv: string) => {
      const parsed = parseCsv(csv).map(normalizeTag);
      const uniq = uniqueTags(parsed);
      setSelectedTags(uniq);

      const normalizedCsv = toTagsCsv(uniq);
      setTagsDraft(normalizedCsv);
      scheduleSaveTags(normalizedCsv);
    },
    [scheduleSaveTags]
  );

  const toggleTag = useCallback(
    (key: string) => {
      const norm = normalizeTag(key);
      if (!norm) return;

      const has = selectedTags.includes(norm);
      const next = has
        ? selectedTags.filter((t) => t !== norm)
        : uniqueTags([...selectedTags, norm]);

      setSelectedTags(next);
      const nextCsv = toTagsCsv(next);
      setTagsDraft(nextCsv);
      scheduleSaveTags(nextCsv);
    },
    [selectedTags, scheduleSaveTags]
  );

  const applyTemplate = useCallback(
    (tpl: Template) => {
      // add tags
      const nextTags = uniqueTags([...selectedTags, ...tpl.addTags]);
      const csv = toTagsCsv(nextTags);
      setSelectedTags(nextTags);
      setTagsDraft(csv);
      scheduleSaveTags(csv);

      // add note line
      const nextNotes = appendLine(notesDraft, tpl.noteLine);
      setNotesDraft(nextNotes);
      scheduleSaveNotes(nextNotes);
    },
    [selectedTags, scheduleSaveTags, notesDraft, scheduleSaveNotes]
  );

  const deleteThisTrade = useCallback(() => {
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
  }, [id, router]);

  const ruleBreakCodes = useMemo(() => {
    return parseRuleBreaks(trade?.ruleBreaks ?? "");
  }, [trade?.ruleBreaks]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", padding: 16, gap: 10 }}>
        <Text style={{ fontWeight: "900", fontSize: 20 }}>Loading…</Text>
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", padding: 16, gap: 10 }}>
        <Text style={{ fontWeight: "900", fontSize: 20 }}>
          Trade not found
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
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

        {ruleBreakCodes.length ? (
          <View style={{ marginTop: 6, gap: 6 }}>
            <Text style={{ color: "#b26a00", fontWeight: "900" }}>
              ⚠ Rule breaks
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ruleBreakCodes.map((code) => (
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
          </View>
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
              opacity: savingTags ? 0.7 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              Save Tags
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setTagsDraft("");
              saveTagsCsv("");
            }}
            disabled={savingTags}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#ddd",
              backgroundColor: "white",
              opacity: savingTags ? 0.7 : 1,
            }}
          >
            <Text style={{ fontWeight: "900" }}>Clear</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#666" }}>{tagsStatusText}</Text>

        {/* Templates */}
        <Text style={{ fontWeight: "900", marginTop: 10 }}>
          Quick mistake templates
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MISTAKE_TEMPLATES.map((tpl) => (
            <Pressable
              key={tpl.label}
              onPress={() => applyTemplate(tpl)}
              disabled={savingTags || savingNotes}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#ddd",
                backgroundColor: "white",
                opacity: savingTags || savingNotes ? 0.7 : 1,
              }}
            >
              <Text style={{ fontWeight: "900" }}>{tpl.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notes */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 12,
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: "900" }}>Notes</Text>

        <TextInput
          value={notesDraft}
          onChangeText={(t) => {
            setNotesDraft(t);
            scheduleSaveNotes(t);
          }}
          multiline
          placeholder="Write what happened…"
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            padding: 12,
            backgroundColor: "white",
            minHeight: 140,
            textAlignVertical: "top",
          }}
          editable={!savingNotes}
        />

        <Text style={{ color: "#666" }}>
          {notesSaveState === "saving"
            ? "Saving…"
            : notesSaveState === "saved"
            ? "Saved ✅"
            : "Autosaves while you type."}
        </Text>
      </View>

      {/* Danger zone */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#ffd6d6",
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: "rgba(255,0,0,0.03)",
        }}
      >
        <Text style={{ fontWeight: "900", color: "#b00020" }}>
          Danger zone
        </Text>

        <Pressable
          onPress={deleteThisTrade}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
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
