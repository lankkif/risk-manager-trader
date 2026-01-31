import React from "react";
import { Text, View } from "react-native";

export default function PlanTab() {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "white" }}>
      <Text style={{ fontSize: 24, fontWeight: "800" }}>Daily Plan</Text>

      <Text style={{ marginTop: 10, fontSize: 16, lineHeight: 22 }}>
        This will become your pre-market checklist:
      </Text>

      <Text style={{ marginTop: 10, fontSize: 16 }}>• Bias (Bull/Bear/Neutral)</Text>
      <Text style={{ fontSize: 16 }}>• Key S/R levels</Text>
      <Text style={{ fontSize: 16 }}>• News caution (Yes/No)</Text>
      <Text style={{ fontSize: 16 }}>• “If-Then” scenarios</Text>

      <Text style={{ marginTop: 18, color: "#555" }}>
        Next: we’ll add input fields + save to the database.
      </Text>
    </View>
  );
}
