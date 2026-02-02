import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type ItemProps = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  badge?: string;
  disabled?: boolean;
};

function MenuItem({ title, subtitle, onPress, badge, disabled }: ItemProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.item,
        pressed && !disabled ? styles.itemPressed : null,
        disabled ? styles.itemDisabled : null,
      ]}
    >
      <View style={{ flex: 1 }}>
        <ThemedText type="defaultSemiBold" style={styles.itemTitle}>
          {title}
        </ThemedText>
        {!!subtitle && (
          <ThemedText type="default" style={styles.itemSubtitle}>
            {subtitle}
          </ThemedText>
        )}
      </View>

      {!!badge && (
        <View style={styles.badge}>
          <ThemedText type="defaultSemiBold" style={styles.badgeText}>
            {badge}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

function Section({ title }: { title: string }) {
  return (
    <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
      {title}
    </ThemedText>
  );
}

export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Menu</ThemedText>
        <ThemedText type="default" style={styles.headerSubtitle}>
          Risk Manager Trader — Control Room
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* QUICK */}
        <Section title="Quick" />
        <MenuItem
          title="Home (Dashboard)"
          subtitle="Command Center overview"
          onPress={() => router.replace("/")}
        />
        <MenuItem
          title="Log Trade"
          subtitle="Quick entry (strategy + R + notes)"
          onPress={() => router.push("/new-trade")}
        />
        <MenuItem
          title="Trades"
          subtitle="All trades (filters + detail)"
          onPress={() => router.push("/journal")}
        />
        <MenuItem
          title="Journal"
          subtitle="Daily closeout + reflection"
          onPress={() => router.push("/closeout")}
        />
        <MenuItem
          title="Strategies"
          subtitle="Playbook + checklists"
          onPress={() => router.push("/explore")}
        />

        {/* CONTROLS */}
        <Section title="Controls" />
        <MenuItem
          title="Risk Manager (Rules Setup)"
          subtitle="Account rules, limits, sessions, instruments"
          onPress={() => router.push("/settings")}
        />
        <MenuItem
          title="Risk Pilot (Enforcement)"
          subtitle="Soft/Hard mode, lockouts, cooldowns"
          onPress={() => router.push("/settings")}
        />
        <MenuItem
          title="Daily Plan"
          subtitle="Pre-session plan & scenarios"
          onPress={() => router.push("/plan")}
        />
        <MenuItem
          title="Detailed Metrics"
          subtitle="Full analytics breakdown"
          onPress={() => router.push("/insights")}
        />

        {/* UTILITIES */}
        <Section title="Utilities" />
        <MenuItem
          title="Export Data"
          subtitle="CSV / JSON backup"
          badge="Soon"
          disabled
        />
        <MenuItem
          title="Notifications"
          subtitle="Session start/end + reminders"
          badge="Soon"
          disabled
        />
        <MenuItem title="Help / FAQ" subtitle="How the app works" badge="Soon" disabled />

        {/* FOOTER */}
        <View style={styles.footer}>
          <ThemedText type="default" style={styles.footerText}>
            Tip: Keep the bottom tabs clean. Use this menu for rules + controls.
          </ThemedText>

          <View style={styles.footerRow}>
            <Pressable style={styles.footerBtn} onPress={() => router.back()}>
              <ThemedText type="defaultSemiBold">Close</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.footerBtn, styles.footerBtnPrimary]}
              onPress={() => router.replace("/")}
            >
              <ThemedText type="defaultSemiBold" style={{ color: "#fff" }}>
                Home
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18 },
  header: { paddingTop: 6, paddingBottom: 10, gap: 6 },
  headerSubtitle: { opacity: 0.75 },

  scroll: { paddingBottom: 18 },

  sectionTitle: { marginTop: 12, marginBottom: 8, opacity: 0.8 },

  item: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.25)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemPressed: { transform: [{ scale: 0.99 }], opacity: 0.92 },
  itemDisabled: { opacity: 0.45 },

  itemTitle: { fontSize: 16 },
  itemSubtitle: { marginTop: 4, opacity: 0.75, fontSize: 13, lineHeight: 18 },

  badge: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, opacity: 0.85 },

  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(120,120,120,0.18)",
    gap: 10,
  },
  footerText: { opacity: 0.7, lineHeight: 18 },

  footerRow: { flexDirection: "row", gap: 10 },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.28)",
    alignItems: "center",
  },
  footerBtnPrimary: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
});
