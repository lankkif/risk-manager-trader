import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Pressable } from "react-native";

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: "center",
        tabBarActiveTintColor: "#111",
        tabBarInactiveTintColor: "#777",

        // ✅ Top-left Hamburger (Drawer/Menu placeholder)
        headerLeft: () => (
          <Pressable
            onPress={() => router.push("/modal")}
            style={{ paddingHorizontal: 14, paddingVertical: 6 }}
            hitSlop={10}
          >
            <Ionicons name="menu" size={24} color="#111" />
          </Pressable>
        ),

        // ✅ Top-right Profile (placeholder -> modal for now)
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/modal")}
            style={{ paddingHorizontal: 14, paddingVertical: 6 }}
            hitSlop={10}
          >
            <Ionicons name="person-circle-outline" size={26} color="#111" />
          </Pressable>
        ),
      }}
    >
      {/* =========================
          ✅ MAIN TABS (MAX 5)
          ========================= */}

      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Center Action */}
      <Tabs.Screen
        name="new-trade"
        options={{
          title: "Log Trade",
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={34} color={color} />
          ),
        }}
      />

      {/* Your current journal screen is actually the Trade Log list */}
      <Tabs.Screen
        name="journal"
        options={{
          title: "Trades",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Temporarily using Closeout as Journal (daily reflection) */}
      <Tabs.Screen
        name="closeout"
        options={{
          title: "Journal",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Your explore tab is currently Strategy Manager (we rename it for now) */}
      <Tabs.Screen
        name="explore"
        options={{
          title: "Strategies",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="layers-outline" size={size} color={color} />
          ),
        }}
      />

      {/* =========================
          ✅ HIDDEN ROUTES (still accessible by router.push)
          We hide these to keep the tab bar clean.
          Later they move into the hamburger drawer.
          ========================= */}

      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
