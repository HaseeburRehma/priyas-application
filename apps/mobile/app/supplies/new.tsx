/**
 * Feature-update #18 (mobile write side) · Report cleaning-supply
 * status after a visit (Figma 22-supplies-new).
 *
 * Field staff pick a property, choose "enough supplies" / "missing",
 * add a note (required when missing), and submit. The insert lands in
 * `public.supply_flags` — the PM sees it on the client detail page
 * (`SupplyFlagsCard`) and can resolve missing items with one tap.
 *
 * All writes go through the offline outbox so a submission made at
 * an out-of-signal property still arrives when the phone reconnects.
 */

import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BottomBar,
  Button,
  Card,
  CenterSpinner,
  ChoiceTile,
  Divider,
  EmptyState,
  FieldLabel,
  Icon,
  InputField,
  ListRow,
  NavHeader,
  Notice,
  RoundButton,
  Screen,
  SearchField,
  SelectField,
  Txt,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { loadPropertiesForPicker } from "@/lib/damage";
import { createSupplyFlag } from "@/lib/supply-flags";
import { colors, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

type PickerProperty = { id: string; name: string; client_name: string };

export default function NewSupplyFlag() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [suppliesOk, setSuppliesOk] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);

  const { data: properties, isLoading: propsLoading } = useQuery({
    queryKey: ["properties-picker"],
    queryFn: loadPropertiesForPicker,
  });

  const selectedProperty = useMemo(
    () => properties?.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  async function onSubmit() {
    if (!profile?.orgId || !profile.employeeId) {
      Alert.alert(t("vacation.notLinkedTitle"), t("vacation.notLinkedBody"));
      return;
    }
    if (!propertyId) {
      Alert.alert(t("supplies.pickPropertyFirst"));
      return;
    }
    if (suppliesOk === null) {
      Alert.alert(t("supplies.pickStatusFirst"));
      return;
    }
    // Missing-supply flags without a note leave the PM guessing what
    // to restock — require at least a short hint.
    if (!suppliesOk && !note.trim()) {
      Alert.alert(t("supplies.noteRequiredForMissing"));
      return;
    }
    setSubmitting(true);
    const r = await createSupplyFlag({
      orgId: profile.orgId,
      employeeId: profile.employeeId,
      propertyId,
      suppliesOk,
      note: note.trim() || null,
    });
    setSubmitting(false);
    if (!r.ok) {
      Alert.alert(t("supplies.submitFailed"), r.error);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["supply-flags"] });
    Alert.alert(t("supplies.thanksTitle"), t("supplies.thanksBody"));
    router.back();
  }

  const missing = suppliesOk === false;
  const noProperties = !propsLoading && (properties ?? []).length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
    >
      <Screen
        gap={20}
        header={<NavHeader title={t("supplies.newTitle")} />}
        footer={
          <BottomBar>
            <Button
              label={t("supplies.submit")}
              icon="send"
              onPress={onSubmit}
              loading={submitting}
              disabled={
                !propertyId ||
                suppliesOk === null ||
                (suppliesOk === false && !note.trim()) ||
                !selectedProperty
              }
            />
          </BottomBar>
        }
      >
        <Txt v="subhead" color={colors.neutral[500]}>
          {t("supplies.newSubtitle")}
        </Txt>

        {/* Property */}
        <View style={{ gap: 6 }}>
          <SelectField
            label={t("supplies.propertyLabel")}
            required
            icon="building"
            value={
              selectedProperty
                ? `${selectedProperty.client_name} · ${selectedProperty.name}`
                : null
            }
            placeholder={propsLoading ? t("common.loading") : t("mobile.ui.damage.pickProperty")}
            onPress={() => setPickerOpen(true)}
          />
          {noProperties ? (
            <Txt v="caption" color={colors.neutral[500]}>
              {t("supplies.noProperties")}
            </Txt>
          ) : null}
        </View>

        {/* Status */}
        <View style={{ gap: 8 }}>
          <FieldLabel label={t("supplies.statusLabel")} required />
          <ChoiceTile
            icon="check"
            tone="success"
            label={t("supplies.statusOk")}
            sub={t("mobile.ui.supplies.okSub")}
            selected={suppliesOk === true}
            onPress={() => setSuppliesOk(true)}
          />
          <ChoiceTile
            icon="alert"
            tone="warning"
            label={t("supplies.statusMissing")}
            sub={t("mobile.ui.supplies.missingSub")}
            selected={missing}
            onPress={() => setSuppliesOk(false)}
          />
        </View>

        {/* Note — required when something is missing */}
        <InputField
          label={missing ? t("supplies.noteLabelRequired") : t("supplies.noteLabel")}
          required={missing}
          value={note}
          onChangeText={setNote}
          placeholder={t("supplies.notePlaceholder")}
          multiline
          numberOfLines={4}
          focused={noteFocused}
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
          hint={missing ? t("supplies.noteRequiredForMissing") : undefined}
        />

        <Notice tone="info" icon="upload">
          {t("mobile.ui.supplies.offlineNotice")}
        </Notice>
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
            <EmptyState icon="building" title={t("supplies.noProperties")} />
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

const styles = StyleSheet.create({
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
