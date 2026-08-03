/**
 * New damage / condition report — pick a property, category, severity,
 * write a description, attach photos, submit.
 *
 * Photos come from expo-image-picker (both camera and library). Each
 * selected image is uploaded to the property-photos bucket immediately
 * so the final insert is fast + the upload state is visible.
 */

import { useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, CenterSpinner, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  createDamageReport,
  loadPropertiesForPicker,
  uploadDamagePhoto,
  type DamageCategory,
} from "@/lib/damage";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

const CATEGORIES: DamageCategory[] = ["normal", "note", "problem", "damage"];
const SEVERITIES = [1, 2, 3, 4, 5] as const;

export default function NewDamageReport() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [category, setCategory] = useState<DamageCategory>("problem");
  const [severity, setSeverity] = useState<number>(3);
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: properties, isLoading: propsLoading } = useQuery({
    queryKey: ["properties-picker"],
    queryFn: loadPropertiesForPicker,
  });

  const selectedProperty = useMemo(
    () => properties?.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  async function pickFromCamera() {
    if (!propertyId) {
      Alert.alert(t("damage.pickPropertyFirst"));
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("damage.cameraPermTitle"), t("damage.cameraPermBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: false,
    });
    if (result.canceled) return;
    await uploadAssets(result.assets);
  }

  async function pickFromLibrary() {
    if (!propertyId) {
      Alert.alert(t("damage.pickPropertyFirst"));
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("damage.libraryPermTitle"), t("damage.libraryPermBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (result.canceled) return;
    await uploadAssets(result.assets);
  }

  async function uploadAssets(
    assets: Array<{ uri: string; mimeType?: string | null }>,
  ) {
    if (!propertyId) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const a of assets) {
      const url = await uploadDamagePhoto({
        propertyId,
        fileUri: a.uri,
        mimeType: a.mimeType ?? null,
      });
      if (url) uploaded.push(url);
    }
    setPhotoUrls((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (uploaded.length < assets.length) {
      Alert.alert(t("damage.uploadPartial"));
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  async function onSubmit() {
    if (!profile?.employeeId || !profile.orgId) {
      Alert.alert(t("vacation.notLinkedTitle"), t("vacation.notLinkedBody"));
      return;
    }
    if (!propertyId) {
      Alert.alert(t("damage.pickPropertyFirst"));
      return;
    }
    if (!description.trim()) {
      Alert.alert(t("damage.descriptionRequired"));
      return;
    }
    setSubmitting(true);
    const r = await createDamageReport({
      orgId: profile.orgId,
      employeeId: profile.employeeId,
      propertyId,
      shiftId: null,
      severity,
      category,
      description,
      photoUrls,
    });
    setSubmitting(false);
    if (!r.ok) {
      Alert.alert(t("damage.submitFailed"), r.error);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["my-damage"] });
    router.back();
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← {t("schedule.back")}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>{t("damage.newTitle")}</Text>
            <Text style={styles.sub}>{t("damage.newSubtitle")}</Text>
          </View>

          <Card style={styles.card}>
            {/* Property picker — a scrollable radio-list, kept simple.
                For orgs with many properties a searchable modal would
                be nicer; ship it that way in a follow-up if the list
                gets past ~30 rows in practice. */}
            <Text style={styles.label}>{t("damage.propertyLabel")}</Text>
            {propsLoading && <CenterSpinner />}
            {!propsLoading && (properties ?? []).length === 0 && (
              <Text style={styles.emptyRow}>{t("damage.noProperties")}</Text>
            )}
            {(properties ?? []).slice(0, 30).map((p) => {
              const active = p.id === propertyId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPropertyId(p.id)}
                  style={[
                    styles.propRow,
                    active && {
                      backgroundColor: colors.primary[50],
                      borderColor: colors.primary[500],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.propName,
                      active && { color: colors.primary[700] },
                    ]}
                  >
                    {p.name}
                  </Text>
                  <Text style={styles.propClient}>{p.client_name}</Text>
                </Pressable>
              );
            })}

            {/* Category */}
            <Text style={[styles.label, { marginTop: spacing[3] }]}>
              {t("damage.categoryLabel")}
            </Text>
            <View style={styles.segment}>
              {CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.segItem,
                      active && styles.segItemActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segLabel,
                        active && styles.segLabelActive,
                      ]}
                    >
                      {t(`damage.category.${c}` as never)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Severity */}
            <Text style={[styles.label, { marginTop: spacing[3] }]}>
              {t("damage.severityLabel")}
            </Text>
            <View style={styles.sevRow}>
              {SEVERITIES.map((n) => {
                const active = severity >= n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setSeverity(n)}
                    style={[
                      styles.sevPip,
                      {
                        backgroundColor: active
                          ? severityColor(severity)
                          : colors.neutral[200],
                      },
                    ]}
                  />
                );
              })}
              <Text style={styles.sevLabel}>
                {t(`damage.severity.${severity}` as never)}
              </Text>
            </View>

            {/* Description */}
            <Text style={[styles.label, { marginTop: spacing[3] }]}>
              {t("damage.descriptionLabel")}
            </Text>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder={t("damage.descriptionPlaceholder")}
              multiline
              numberOfLines={4}
              style={styles.textarea}
              textAlignVertical="top"
            />

            {/* Photos */}
            <Text style={[styles.label, { marginTop: spacing[3] }]}>
              {t("damage.photosLabel")}
            </Text>
            <View style={styles.photoBtnRow}>
              <Pressable
                onPress={pickFromCamera}
                disabled={uploading}
                style={styles.photoBtn}
              >
                <Text style={styles.photoBtnText}>📷 {t("damage.takePhoto")}</Text>
              </Pressable>
              <Pressable
                onPress={pickFromLibrary}
                disabled={uploading}
                style={styles.photoBtn}
              >
                <Text style={styles.photoBtnText}>🖼 {t("damage.chooseFromLibrary")}</Text>
              </Pressable>
            </View>
            {uploading && (
              <Text style={styles.uploadingText}>{t("damage.uploading")}</Text>
            )}
            {photoUrls.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.previewRow}
              >
                {photoUrls.map((url) => (
                  <View key={url} style={styles.previewWrap}>
                    <Image
                      source={{ uri: url }}
                      style={styles.preview}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => removePhoto(url)}
                      style={styles.removeBtn}
                    >
                      <Text style={styles.removeBtnText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Button
              label={t("damage.submit")}
              onPress={onSubmit}
              loading={submitting}
              disabled={
                !propertyId ||
                !description.trim() ||
                uploading ||
                !selectedProperty
              }
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function severityColor(level: number): string {
  if (level >= 5) return colors.error[500];
  if (level >= 4) return colors.warning[500];
  if (level >= 3) return colors.warning[300];
  return colors.primary[500];
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[3],
  },
  back: { marginBottom: spacing[1] },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
  },
  header: { gap: spacing[1] },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
  },
  card: { gap: spacing[2] },
  label: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[700],
    marginBottom: 6,
  },
  emptyRow: {
    padding: spacing[4],
    textAlign: "center",
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  propRow: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing[2],
  },
  propName: {
    fontSize: typography.size.md,
    fontWeight: "600",
    color: colors.neutral[800],
  },
  propClient: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  segment: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    overflow: "hidden",
    backgroundColor: colors.white,
  },
  segItem: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  segItemActive: {
    backgroundColor: colors.primary[500],
  },
  segLabel: {
    fontSize: typography.size.sm,
    fontWeight: "600",
    color: colors.neutral[700],
  },
  segLabelActive: { color: colors.white },
  sevRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sevPip: {
    width: 32,
    height: 12,
    borderRadius: 6,
  },
  sevLabel: {
    marginLeft: spacing[2],
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[700],
  },
  textarea: {
    minHeight: 100,
    paddingTop: spacing[3],
  },
  photoBtnRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  photoBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
    alignItems: "center",
  },
  photoBtnText: {
    fontSize: typography.size.sm,
    fontWeight: "600",
    color: colors.neutral[700],
  },
  uploadingText: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    fontStyle: "italic",
    marginTop: spacing[1],
  },
  previewRow: {
    marginTop: spacing[2],
  },
  previewWrap: {
    marginRight: spacing[2],
    position: "relative",
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.neutral[100],
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error[500],
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
    lineHeight: 18,
  },
});
