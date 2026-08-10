import { Stack } from "expo-router";
import { colors } from "@/lib/theme";
export default function PropertiesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.tertiary[200] },
      }}
    />
  );
}
