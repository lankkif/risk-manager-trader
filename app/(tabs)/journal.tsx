import React from "react";
import { Text, View } from "react-native";

export default function JournalTab() {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
      <Text style={{ fontSize: 24, fontWeight: "800" }}>Journal</Text>

      <Text style={{ marginTop: 10, fontSize: 16, lineHeight: 22 }}>
        Two things will live here:
      </Text>

      <Text style={{ marginTop: 10, fontSize: 16 }}>1) Trade Log (fast entry)</Text>
      <Text style={{ fontSize: 16 }}>2) Daily Closeout (mandatory)</Text>

      <Text style={{ marginTop: 18, color: "#555" }}>
        Next: we’ll build the Closeout form that locks tomorrow until completed.
      </Text>
    </View>
  );
}
