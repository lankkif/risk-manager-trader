import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 10 : 16);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // ✅ Dark + purple vibe (we can add light mode later)
        tabBarStyle: {
          backgroundColor: "#0b0b0f",
          borderTopColor: "#1f1f2a",
          borderTopWidth: 1,

          // ✅ Fix Android nav buttons overlapping the tabs
          paddingBottom: bottomPad,
          paddingTop: 10,
          height: 64 + bottomPad,
        },

        tabBarActiveTintColor: "#a855f7", // purple
        tabBarInactiveTintColor: "#7c7c8a",

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },

        tabBarHideOnKeyboard: true,
      }}
    >
      {/* ✅ 5 MAIN TABS MAX (clean + clickable) */}

      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ✅ Center “Log Trade” action */}
      <Tabs.Screen
        name="new-trade"
        options={{
          title: "Log",
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={36} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Metrics",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ✅ Hidden routes (still accessible from hamburger later) */}
      <Tabs.Screen
        name="closeout"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
