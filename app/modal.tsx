import { Link } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type MenuItemProps = {
  title: string;
  subtitle?: string;
  href?: string;
  badge?: string;
  disabled?: boolean;
};

function MenuItem({ title, subtitle, href, badge, disabled }: MenuItemProps) {
  const content = (
    <Pressable
      disabled={disabled}
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

  // If disabled or no href, render static row
  if (disabled || !href) return content;

  // ✅ dismissTo is boolean in your router types — it dismisses the modal when navigating
  return (
    <Link href={href as any} dismissTo asChild>
      {content}
    </Link>
  );
}

export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Menu</ThemedText>
        <ThemedText type="default" style={styles.headerSubtitle}>
          Risk Manager Trader — control room
        </ThemedText>
      </View>

      {/* QUICK NAV */}
      <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
        Quick
      </ThemedText>

      <MenuItem title="Home (Dashboard)" subtitle="Command Center overview" href="/" />

      <MenuItem
        title="Detailed Metrics"
        subtitle="Full analytics breakdown"
        href="/insights"
      />

      <MenuItem
        title="Daily Plan"
        subtitle="Pre-session plan and scenarios"
        href="/plan"
      />

      {/* CORE CONFIG */}
      <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
        Controls
      </ThemedText>

      <MenuItem
        title="Risk Manager (Rules Setup)"
        subtitle="Account, limits, sessions, instruments"
        href="/settings"
      />

      <MenuItem
        title="Risk Pilot (Enforcement)"
        subtitle="Soft/Hard mode, lockouts, cooldowns"
        href="/settings"
      />

      {/* UTILITIES */}
      <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
        Utilities
      </ThemedText>

      <MenuItem
        title="Export Data"
        subtitle="CSV / JSON backup"
        badge="Soon"
        disabled
      />

      <MenuItem
        title="Notifications"
        subtitle="Session alerts and reminders"
        badge="Soon"
        disabled
      />

      <MenuItem title="Help / FAQ" subtitle="How the app works" badge="Soon" disabled />

      {/* ACCOUNT */}
      <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
        Account
      </ThemedText>

      <MenuItem
        title="Profile"
        subtitle="Offline-first profile (cloud later)"
        badge="Soon"
        disabled
      />

      <View style={styles.footer}>
        <ThemedText type="default" style={styles.footerText}>
          Tip: Keep tabs clean. Use this menu for rules + controls.
        </ThemedText>

        <Link href="/" dismissTo style={styles.closeLink}>
          <ThemedText type="link">Close</ThemedText>
        </Link>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    gap: 10,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 8,
    gap: 6,
  },
  headerSubtitle: {
    opacity: 0.75,
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 6,
    opacity: 0.8,
  },
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
  itemPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92,
  },
  itemDisabled: {
    opacity: 0.45,
  },
  itemTitle: {
    fontSize: 16,
  },
  itemSubtitle: {
    marginTop: 4,
    opacity: 0.75,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    opacity: 0.85,
  },
  footer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(120,120,120,0.18)",
    gap: 10,
  },
  footerText: {
    opacity: 0.7,
    lineHeight: 18,
  },
  closeLink: {
    paddingVertical: 10,
  },
});
