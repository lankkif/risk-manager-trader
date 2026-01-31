import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { initDb } from "../src/db/db";

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
      } catch (e) {
        console.warn("DB init failed:", e);
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Starting Risk Manager Trader…</Text>
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="trade/[id]" options={{ title: "Trade" }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
