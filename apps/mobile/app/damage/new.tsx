/**
 * New damage / condition report — pick a property, category, severity,
 * write a description, attach photos, submit (Figma 21-damage-new).
 *
 * Photos come from expo-image-picker (both camera and library). Each
 * selected image is uploaded to the property-photos bucket immediately
 * so the final insert is fast + the upload state is visible.
 */

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import {
  BottomBar,
  Button,
  Card,
  CenterSpinner,
  ChoiceTile,
  Divider,
  EmptyState,
  FieldLabel,
  Grid,
  HALF,
  Icon,
  InputField,
  ListRow,
  NavHeader,
  RoundButton,
  Screen,
  SearchField,
  SelectField,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  createDamageReport,
  loadPropertiesForPicker,
  uploadDamagePhoto,
  type DamageCategory,
} from "@/lib/damage";
import { colors, radius, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

const CATEGORIES: DamageCategory[] = ["normal", "note", "problem", "damage"];
const SEVERITIES = [1, 2, 3, 4, 5] as const;

const CATEGORY_STYLE: Record<DamageCategory, { icon: IconName; tone: Tone }> = {
  normal: { icon: "check", tone: "success" },
  note: { icon: "file-text", tone: "info" },
  problem: { icon: "alert", tone: "warning" },
  damage: { icon: "camera", tone: "error" },
};

type PickerProperty = { id: string; name: string; client_name: string };

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

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
    // The system photo picker (Android Photo Picker / iOS PHPicker) needs no
    // media permission; READ_MEDIA_IMAGES is blocked in app.json for Play policy.
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
    const results = await Promise.all(
      assets.map((a) =>
        uploadDamagePhoto({
          propertyId,
          fileUri: a.uri,
          mimeType: a.mimeType ?? null,
        }),
      ),
    );
    const uploaded = results.filter((url): url is string => !!url);
    setPhotoUrls((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (uploaded.length < assets.length) {
      Alert.alert(t("damage.uploadPartial"));
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  /** Single "add photo" tile → choose camera or library (both flows kept). */
  function onAddPhoto() {
    if (!propertyId) {
      Alert.alert(t("damage.pickPropertyFirst"));
      return;
    }
    Alert.alert(t("mobile.ui.damage.addPhotoTitle"), undefined, [
      { text: t("damage.takePhoto"), onPress: () => void pickFromCamera() },
      { text: t("damage.chooseFromLibrary"), onPress: () => void pickFromLibrary() },
      { text: t("damage.cancel"), style: "cancel" },
    ]);
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

  const noProperties = !propsLoading && (properties ?? []).length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
    >
      <Screen
        gap={20}
        header={<NavHeader title={t("damage.newReport")} />}
        footer={
          <BottomBar>
            <Button
              label={t("damage.submit")}
              icon="send"
              onPress={onSubmit}
              loading={submitting}
              disabled={
                !propertyId ||
                !description.trim() ||
                uploading ||
                !selectedProperty
              }
            />
            <Button
              label={t("damage.cancel")}
              variant="ghost"
              size="md"
              onPress={() => router.back()}
            />
          </BottomBar>
        }
      >
        <Txt v="subhead" color={colors.neutral[500]}>
          {t("damage.modalSubtitle")}
        </Txt>

        {/* Property */}
        <View style={{ gap: 6 }}>
          <SelectField
            label={t("damage.propertyLabel")}
            required
            icon="building"
            value={
              selectedProperty
                ? `${selectedProperty.name} · ${selectedProperty.client_name}`
                : null
            }
            placeholder={propsLoading ? t("common.loading") : t("mobile.ui.damage.pickProperty")}
            onPress={() => setPickerOpen(true)}
          />
          {noProperties ? (
            <Txt v="caption" color={colors.neutral[500]}>
              {t("damage.noProperties")}
            </Txt>
          ) : null}
        </View>

        {/* Category */}
        <View style={{ gap: 8 }}>
          <FieldLabel label={t("damage.categoryLabel")} required />
          <Grid gap={10}>
            {CATEGORIES.map((c) => (
              <ChoiceTile
                key={c}
                style={HALF}
                label={t(`damage.category.${c}`)}
                icon={CATEGORY_STYLE[c].icon}
                tone={CATEGORY_STYLE[c].tone}
                selected={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </Grid>
        </View>

        {/* Severity */}
        <View style={{ gap: 8 }}>
          <View style={styles.rowBetween}>
            <FieldLabel label={t("damage.severityLabel")} required />
            <Txt v="subheadStrong" color={severityFg(severity)}>
              {severity} · {t(`damage.severity.${severity}`)}
            </Txt>
          </View>
          <View style={styles.sevRow}>
            {SEVERITIES.map((n) => {
              const on = n === severity;
              const c = severityColor(n);
              return (
                <Pressable
                  key={n}
                  onPress={() => setSeverity(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${n} · ${t(`damage.severity.${n}`)}`}
                  style={[styles.sevBox, on && { backgroundColor: c, borderColor: c }]}
                >
                  <Txt v="bodyStrong" color={on ? colors.white : colors.neutral[700]}>
                    {n}
                  </Txt>
                  <View style={[styles.sevTick, { backgroundColor: on ? colors.white : c }]} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rowBetween}>
            <Txt v="caption" color={colors.neutral[400]}>
              {t("damage.severity.1")}
            </Txt>
            <Txt v="caption" color={colors.neutral[400]}>
              {t("damage.severity.5")}
            </Txt>
          </View>
        </View>

        {/* Description */}
        <InputField
          label={t("damage.description")}
          required
          value={description}
          onChangeText={setDescription}
          placeholder={t("damage.descriptionPlaceholder")}
          multiline
          numberOfLines={4}
          focused={descFocused}
          onFocus={() => setDescFocused(true)}
          onBlur={() => setDescFocused(false)}
        />

        {/* Photos */}
        <View style={{ gap: 8 }}>
          <View style={styles.rowBetween}>
            <FieldLabel label={t("damage.photos")} />
            {photoUrls.length > 0 ? (
              <Txt v="caption" color={colors.neutral[500]}>
                {t("damage.photosAttached", { n: photoUrls.length })}
              </Txt>
            ) : null}
          </View>
          <View style={styles.photoGrid}>
            {photoUrls.map((url) => (
              <View key={url} style={styles.thumb}>
                <Image source={{ uri: url }} style={styles.thumbImg} resizeMode="cover" />
                <Pressable
                  onPress={() => removePhoto(url)}
                  hitSlop={8}
                  style={styles.thumbX}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.delete")}
                >
                  <Icon name="x" size={14} color={colors.white} strokeWidth={3} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={onAddPhoto}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel={t("mobile.ui.damage.addPhotoTitle")}
              style={({ pressed }) => [styles.thumb, styles.addTile, pressed && { opacity: 0.8 }]}
            >
              {uploading ? (
                <ActivityIndicator color={colors.primary[500]} />
              ) : (
                <Icon name="plus" size={22} color={colors.neutral[600]} />
              )}
              <Txt v="caption" color={colors.neutral[600]}>
                {t("mobile.ui.damage.addPhoto")}
              </Txt>
            </Pressable>
          </View>
          {uploading ? (
            <Txt v="caption" color={colors.neutral[500]}>
              {t("damage.uploading")}
            </Txt>
          ) : null}
        </View>
      </Screen>

      <PropertyPicker
        visible={pickerOpen}
        loading={propsLoading}
        properties={properties ?? []}
        selectedId={propertyId}
        onSelect={(id) => {
          setPropertyId(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

/* --------------------------- Property picker --------------------------- */

function PropertyPicker({
  visible,
  loading,
  properties,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  loading: boolean;
  properties: PickerProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return properties;
    return properties.filter(
      (p) => p.name.toLowerCase().includes(n) || p.client_name.toLowerCase().includes(n),
    );
  }, [q, properties]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
        edges={Platform.OS === "ios" ? ["bottom"] : ["top", "bottom"]}
      >
        <View style={styles.sheetHead}>
          <Txt v="headline" style={{ flex: 1 }}>
            {t("mobile.ui.damage.pickProperty")}
          </Txt>
          <RoundButton icon="x" onPress={onClose} accessibilityLabel={t("common.cancel")} />
        </View>
        <View style={styles.sheetBody}>
          <SearchField value={q} onChangeText={setQ} placeholder={t("common.search")} />
          {loading ? (
            <CenterSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState icon="building" title={t("damage.noProperties")} />
          ) : (
            <Card padded={false} style={styles.sheetList}>
              <FlatList
                data={filtered}
                keyExtractor={(p) => p.id}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={Divider}
                renderItem={({ item: p }) => (
                  <ListRow
                    title={p.name}
                    subtitle={p.client_name}
                    highlight={p.id === selectedId}
                    chevron={false}
                    trailing={
                      p.id === selectedId ? (
                        <Icon name="check" size={18} color={colors.primary[600]} strokeWidth={2.5} />
                      ) : null
                    }
                    onPress={() => onSelect(p.id)}
                  />
                )}
              />
            </Card>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------- Helpers ------------------------------- */

function severityColor(level: number): string {
  if (level >= 5) return colors.error[700];
  if (level === 4) return colors.error[500];
  if (level === 3) return colors.warning[500];
  if (level === 2) return colors.primary[500];
  return colors.success[500];
}

function severityFg(level: number): string {
  if (level >= 4) return colors.error[700];
  if (level === 3) return colors.warning[700];
  if (level === 2) return colors.primary[700];
  return colors.success[700];
}

const THUMB = 92;

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[2] },
  sevRow: { flexDirection: "row", gap: spacing[2] },
  sevBox: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  sevTick: { width: 16, height: 3, borderRadius: 2 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.lg },
  thumbImg: { width: THUMB, height: THUMB, borderRadius: radius.lg, backgroundColor: colors.neutral[100] },
  thumbX: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutral[900],
  },
  addTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.neutral[300],
    backgroundColor: colors.neutral[50],
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  sheetBody: { flex: 1, gap: spacing[3], paddingHorizontal: spacing[4] },
  sheetList: { flexShrink: 1, overflow: "hidden", marginBottom: spacing[3] },
});
