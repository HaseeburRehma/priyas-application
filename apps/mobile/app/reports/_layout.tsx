import { Stack } from "expo-router";
import { colors } from "@/lib/theme";
export default function ReportsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.tertiary[200] },
      }}
    />
  );
}
