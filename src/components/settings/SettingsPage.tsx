"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { updateSettingsAction } from "@/app/actions/settings";
import type { SettingsData } from "@/lib/api/settings";
import { SecuritySection } from "./SecuritySection";
import { PushToggleCard } from "./PushToggleCard";
import { AvatarUpload } from "./AvatarUpload";
import { LogoUpload } from "./LogoUpload";
import { InviteEmployeeDialog } from "@/components/employees/InviteEmployeeDialog";
import { signOutOtherDevicesAction } from "@/app/actions/sessions";
import { listDevicesAction, revokeDeviceAction } from "@/app/actions/devices";

/**
 * Settings — full prototype-parity rebuild covering 8 cards across
 * two groups (Management 01-05, Personal 06-08). Built on top of:
 *   - `updateSettingsAction(patch)` — deep merges into settings.data JSONB
 *   - `revokeDeviceAction(id)` / `listDevicesAction()` — sessions module
 *   - `signOutOtherDevicesAction()` — global revoke
 *
 * Top sticky bar shows the rolled-up dirty-state across sections. Each
 * section also keeps its own SaveBar so you can save without reaching
 * for the top bar.
 */

const MGMT_SECTIONS = [
  "company",
  "team",
  "tax",
  "integrations",
  "notifications",
] as const;
const PERSONAL_SECTIONS = ["account", "security", "sessions"] as const;

type Section =
  | (typeof MGMT_SECTIONS)[number]
  | (typeof PERSONAL_SECTIONS)[number];

type Props = { data: SettingsData; canEdit: boolean };

/* ============================================================================
 *  DIRTY-STATE CONTEXT
 *
 *  Each editable section registers a (key, saveFn, discardFn) on mount.
 *  When the section's local form is mutated, it calls setDirty(key, true).
 *  The top sticky bar reads the dirty list to show the rolled-up summary,
 *  and the bulk Save / Discard buttons fan out to every registered handler.
 * ========================================================================== */

type DirtyHandle = {
  save: () => Promise<void>;
  discard: () => void;
  label: string;
};
type DirtyContextValue = {
  dirty: Record<string, boolean>;
  register: (key: string, handle: DirtyHandle) => () => void;
  setDirty: (key: string, isDirty: boolean) => void;
  saveAll: () => Promise<void>;
  discardAll: () => void;
};
const DirtyContext = createContext<DirtyContextValue | null>(null);

function useDirty(): DirtyContextValue {
  const v = useContext(DirtyContext);
  if (!v) throw new Error("useDirty must be used inside DirtyContext");
  return v;
}

function DirtyProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirtyState] = useState<Record<string, boolean>>({});
  const handles = useRef<Record<string, DirtyHandle>>({});

  const register = useCallback((key: string, handle: DirtyHandle) => {
    handles.current[key] = handle;
    return () => {
      delete handles.current[key];
      setDirtyState((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    };
  }, []);

  const setDirty = useCallback((key: string, isDirty: boolean) => {
    setDirtyState((d) => (d[key] === isDirty ? d : { ...d, [key]: isDirty }));
  }, []);

  const saveAll = useCallback(async () => {
    const toSave = Object.entries(dirty)
      .filter(([, v]) => v)
      .map(([k]) => handles.current[k])
      .filter((h): h is DirtyHandle => !!h);
    await Promise.all(toSave.map((h) => h.save()));
  }, [dirty]);

  const discardAll = useCallback(() => {
    Object.entries(dirty)
      .filter(([, v]) => v)
      .forEach(([k]) => handles.current[k]?.discard());
  }, [dirty]);

  const value = useMemo(
    () => ({ dirty, register, setDirty, saveAll, discardAll }),
    [dirty, register, setDirty, saveAll, discardAll],
  );

  return <DirtyContext.Provider value={value}>{children}</DirtyContext.Provider>;
}

/** Registers a section's save/discard handles so the top bar can fan
 *  out bulk operations. Returns the per-section dirty flag setter. */
function useRegisterSection(
  key: string,
  handle: { save: () => Promise<void>; discard: () => void; label: string },
) {
  const { register, setDirty, dirty } = useDirty();
  // Hold the latest handle in a ref so we re-register with up-to-date
  // closures whenever save/discard depend on changing state — without
  // tearing down + re-creating the registration on every keystroke.
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    const unsub = register(key, {
      label: handle.label,
      save: () => handleRef.current.save(),
      discard: () => handleRef.current.discard(),
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    isDirty: !!dirty[key],
    markDirty: (v: boolean) => setDirty(key, v),
  };
}

/* ============================================================================
 *  PAGE
 * ========================================================================== */

export function SettingsPage({ data, canEdit }: Props) {
  return (
    <DirtyProvider>
      <SettingsInner data={data} canEdit={canEdit} />
    </DirtyProvider>
  );
}

function SettingsInner({ data, canEdit }: Props) {
  const t = useTranslations("settings");
  const [active, setActive] = useState<Section>("company");

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbAccount")}</span>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      {/* Page head + save bar */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">
            {t.rich("subtitleWithSaved", {
              at: (chunks) => <b className="text-neutral-800">{chunks}</b>,
              ts: data.savedAt ?? "—",
            })}
          </p>
        </div>
      </div>

      <StickySaveBar canEdit={canEdit} />

      {/* Two-column settings shell */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm xl:sticky xl:top-20">
          <SectionNavLabel>{t("navGroup.management")}</SectionNavLabel>
          {MGMT_SECTIONS.map((s) => (
            <SectionNavItem
              key={s}
              active={active === s}
              onClick={() => setActive(s)}
              label={t(`nav.${s}` as never)}
              icon={NAV_ICONS[s]}
              badge={NAV_BADGES[s]?.(data)}
            />
          ))}
          <div className="my-2 h-px bg-neutral-100" />
          <SectionNavLabel>{t("navGroup.personal")}</SectionNavLabel>
          {PERSONAL_SECTIONS.map((s) => (
            <SectionNavItem
              key={s}
              active={active === s}
              onClick={() => setActive(s)}
              label={t(`nav.${s}` as never)}
              icon={NAV_ICONS[s]}
              badge={NAV_BADGES[s]?.(data)}
            />
          ))}
          <div className="mt-2 border-t border-neutral-100 px-2.5 pt-2.5 text-[11px] leading-[1.5] text-neutral-500">
            <b className="mb-0.5 block text-[12px] text-neutral-800">
              {t("helpTitle")}
            </b>
            {t("helpBody")}
          </div>
        </aside>

        {/* Main content column */}
        <div className="flex min-w-0 flex-col gap-4">
          {active === "company" && (
            <CompanySection data={data} canEdit={canEdit} />
          )}
          {active === "team" && <TeamSection data={data} />}
          {active === "tax" && <TaxSection data={data} canEdit={canEdit} />}
          {active === "integrations" && (
            <IntegrationsSection data={data} canEdit={canEdit} />
          )}
          {active === "notifications" && (
            <NotificationsSection data={data} canEdit={canEdit} />
          )}
          {active === "account" && (
            <AccountSection data={data} canEdit={canEdit} />
          )}
          {active === "security" && <SecurityWrap data={data} canEdit={canEdit} />}
          {active === "sessions" && <SessionsSection />}
        </div>
      </div>
    </>
  );
}

/* ============================================================================
 *  STICKY TOP SAVE BAR
 * ========================================================================== */

function StickySaveBar({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations("settings");
  const { dirty, saveAll, discardAll } = useDirty();
  const [saving, startSave] = useTransition();
  const dirtyEntries = Object.entries(dirty).filter(([, v]) => v);
  if (!canEdit || dirtyEntries.length === 0) return null;

  function onSave() {
    startSave(async () => {
      try {
        await saveAll();
        toast.success(t("bulkSaved"));
      } catch (e) {
        toast.error((e as Error)?.message || t("bulkSaveError"));
      }
    });
  }

  return (
    <div className="sticky top-0 z-30 mb-4 -mt-1 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-500 bg-warning-50 px-4 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-warning-700">
        <span className="inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning-500" />
        <b className="font-bold">
          {t("unsavedCount", { count: dirtyEntries.length })}
        </b>
        <span>·</span>
        <span className="truncate text-warning-700">
          {dirtyEntries
            .map(([k]) => t(`nav.${k as Section}` as never))
            .join(", ")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => discardAll()}
          disabled={saving}
          className="btn btn--ghost border border-neutral-200 bg-white btn--sm disabled:opacity-60"
        >
          {t("discard")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn btn--primary btn--sm disabled:opacity-80"
        >
          {saving ? t("savingAll") : t("saveAll")}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 *  NAV BUILDING BLOCKS
 * ========================================================================== */

const NAV_ICONS: Record<Section, React.ReactNode> = {
  company: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" />
      <path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h6" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx={9} cy={7} r={4} />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  tax: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2} y={5} width={20} height={14} rx={2} />
      <line x1={2} y1={10} x2={22} y2={10} />
    </svg>
  ),
  integrations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  sessions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2} y={3} width={20} height={14} rx={2} />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
};

const NAV_BADGES: Partial<Record<Section, (d: SettingsData) => string | null>> = {
  team: (d) => String(d.members.length),
  integrations: () => "3/6",
};

function SectionNavLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
      {children}
    </div>
  );
}

function SectionNavItem({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-px flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition",
        active
          ? "bg-primary-50 font-semibold text-primary-700"
          : "text-neutral-700 hover:bg-neutral-100",
      )}
    >
      <span
        className={cn(
          "h-3.5 w-3.5 flex-shrink-0",
          active ? "text-primary-700" : "text-neutral-500",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className={cn(
            "ml-auto text-[10px] font-semibold",
            active ? "text-primary-700" : "text-neutral-500",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ============================================================================
 *  CARD WRAPPER + SHARED PIECES
 * ========================================================================== */

function Card({
  id,
  num,
  area,
  title,
  subtitle,
  actions,
  children,
  footer,
}: {
  id?: string;
  num: string;
  area: "mgmt" | "personal";
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.01em] text-neutral-800">
            <SectionIdChip area={area}>{num}</SectionIdChip>
            <span>{title}</span>
          </h2>
          <p className="mt-1 text-[12px] text-neutral-500">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3 text-[12px] text-neutral-500">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function SectionIdChip({
  area,
  children,
}: {
  area: "mgmt" | "personal";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        area === "mgmt"
          ? "bg-primary-50 text-primary-700"
          : "bg-secondary-50 text-secondary-700",
      )}
    >
      {children}
    </span>
  );
}

function SubH({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-neutral-500">
        {children}
      </h3>
      {right}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[12px] font-semibold text-neutral-700">
        {label}
        {hint && (
          <span className="font-normal text-[11px] text-neutral-500">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function HR() {
  return <div className="my-5 h-px bg-neutral-100" />;
}

function SaveBar({
  pending,
  onSave,
  canEdit,
}: {
  pending: boolean;
  onSave: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations("settings");
  if (!canEdit) return null;
  return (
    <div className="mt-5 flex justify-end">
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className={cn("btn btn--primary", pending && "opacity-80")}
      >
        {pending ? "…" : t("save")}
      </button>
    </div>
  );
}

/* ============================================================================
 *  01 · COMPANY PROFILE
 *
 *  Adds vs. previous version:
 *    - Industry + Company-size dropdowns
 *    - Brand colour palette with named swatches
 *    - Document-tone segmented (Professional / Friendly / Minimal)
 *    - Operational locations CRUD (HQ + depots + satellites)
 * ========================================================================== */

type LocationEntry = {
  id: string;
  name: string;
  address: string;
  type: "hq" | "depot" | "satellite";
};

function CompanySection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.company");
  const router = useRouter();
  const [pending, start] = useTransition();
  const company = (data.data.company ?? {}) as Record<string, unknown>;

  const initial = useMemo(
    () => ({
      legalName: String(company.legalName ?? data.org.name ?? ""),
      tradingName: String(company.tradingName ?? data.org.name ?? ""),
      vatId: String(company.vatId ?? ""),
      registration: String(company.registration ?? ""),
      address: String(company.address ?? ""),
      supportEmail: String(company.supportEmail ?? ""),
      supportPhone: String(company.supportPhone ?? ""),
      industry: String(company.industry ?? "facility_services"),
      companySize: String(company.companySize ?? "21-50"),
      documentTone: String(company.documentTone ?? "professional"),
      website: String(company.website ?? ""),
      brandColors: (company.brandColors as Record<string, string>) ?? {
        primary: "#72A94F",
        secondary: "#16587C",
        accent: "#A8CC87",
        warning: "#F4A261",
      },
      locations: (company.locations as LocationEntry[]) ?? [
        {
          id: "loc-hq",
          name: t("defaultHqName"),
          address: t("defaultHqAddress"),
          type: "hq",
        },
      ],
    }),
    // We intentionally do NOT depend on `t` — this only freezes the
    // initial form on first render. Subsequent updates to translations
    // shouldn't reset the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const [form, setForm] = useState(initial);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = useCallback(
    async () => {
      const result = await updateSettingsAction({ company: form });
      if (!result.ok) {
        toast.error(result.error);
        throw new Error(result.error);
      }
      toast.success(t("savedToast"));
      router.refresh();
    },
    [form, router, t],
  );
  const discard = useCallback(() => setForm(initial), [initial]);

  const { markDirty } = useRegisterSection("company", {
    save,
    discard,
    label: t("title"),
  });

  useEffect(() => {
    markDirty(isDirty);
    // markDirty is stable; the effect re-runs when isDirty flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setColor(slot: keyof typeof form.brandColors, hex: string) {
    setForm((f) => ({ ...f, brandColors: { ...f.brandColors, [slot]: hex } }));
  }

  function addLocation() {
    setForm((f) => ({
      ...f,
      locations: [
        ...f.locations,
        {
          id: `loc-${Date.now()}`,
          name: "",
          address: "",
          type: "depot",
        },
      ],
    }));
  }

  function updateLocation(
    id: string,
    patch: Partial<Omit<LocationEntry, "id">>,
  ) {
    setForm((f) => ({
      ...f,
      locations: f.locations.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
  }

  function removeLocation(id: string) {
    setForm((f) => ({ ...f, locations: f.locations.filter((l) => l.id !== id) }));
  }

  function onSave() {
    start(async () => {
      try {
        await save();
      } catch {
        /* error already toasted */
      }
    });
  }

  return (
    <Card num={t("badge")} area="mgmt" title={t("title")} subtitle={t("subtitle")}>
      {/* Brand row */}
      <div className="mb-5 grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-neutral-100 pb-5">
        <LogoUpload
          initialUrl={data.org.logo_url}
          fallbackLetter={
            (form.tradingName || data.org.name).charAt(0) || "P"
          }
          canEdit={canEdit}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em] text-neutral-800">
            <span className="truncate">{form.legalName || data.org.name}</span>
            <span
              title={t("verified")}
              className="grid h-[18px] w-[18px] place-items-center rounded-full bg-success-500 text-white"
            >
              <svg
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-neutral-500">
            <span>🇩🇪 Deutschland</span>
            <span>·</span>
            <span>
              {data.members.length} {t("members")}
            </span>
          </div>
        </div>
        <div />
      </div>

      {/* Legal */}
      <SubH>{t("legalRegistration")}</SubH>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("legalName")} hint={t("legalNameHint")}>
          <Input
            value={form.legalName}
            onChange={(e) => setField("legalName", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("tradingName")}>
          <Input
            value={form.tradingName}
            onChange={(e) => setField("tradingName", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("registration")}>
          <Input
            mono
            value={form.registration}
            onChange={(e) => setField("registration", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("vatId")}>
          <Input
            mono
            value={form.vatId}
            onChange={(e) => setField("vatId", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("industry")}>
          <Select
            value={form.industry}
            onChange={(e) => setField("industry", e.target.value)}
            disabled={!canEdit}
          >
            <option value="facility_services">{t("ind.facility")}</option>
            <option value="cleaning">{t("ind.cleaning")}</option>
            <option value="care">{t("ind.care")}</option>
            <option value="security">{t("ind.security")}</option>
            <option value="logistics">{t("ind.logistics")}</option>
          </Select>
        </Field>
        <Field label={t("companySize")}>
          <Select
            value={form.companySize}
            onChange={(e) => setField("companySize", e.target.value)}
            disabled={!canEdit}
          >
            <option value="1-10">1–10</option>
            <option value="11-20">11–20</option>
            <option value="21-50">21–50</option>
            <option value="51-100">51–100</option>
            <option value="101-250">101–250</option>
          </Select>
        </Field>
        <Field label={t("supportEmail")}>
          <Input
            type="email"
            value={form.supportEmail}
            onChange={(e) => setField("supportEmail", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("supportPhone")}>
          <Input
            value={form.supportPhone}
            onChange={(e) => setField("supportPhone", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label={t("website")}>
            <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
              <span className="font-mono text-[11px] text-neutral-500">https://</span>
              <input
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
                disabled={!canEdit}
                placeholder="priyas-cleaning.de"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </div>
          </Field>
        </div>
      </div>

      <HR />

      {/* Branding (colours + document tone) */}
      <SubH>{t("brandColors")}</SubH>
      <div className="flex flex-wrap items-end gap-5">
        {(["primary", "secondary", "accent", "warning"] as const).map((slot) => (
          <div key={slot} className="flex flex-col items-center gap-1">
            <label
              className="grid h-12 w-12 cursor-pointer place-items-center rounded-lg ring-1 ring-neutral-200"
              style={{ backgroundColor: form.brandColors[slot] }}
            >
              <input
                type="color"
                value={form.brandColors[slot]}
                onChange={(e) => setColor(slot, e.target.value)}
                disabled={!canEdit}
                className="h-0 w-0 opacity-0"
                aria-label={t(`color.${slot}` as never)}
              />
            </label>
            <span className="font-mono text-[10px] text-neutral-500">
              {form.brandColors[slot]}
            </span>
            <span className="text-[10px] font-medium text-neutral-600">
              {t(`color.${slot}` as never)}
            </span>
          </div>
        ))}

        <div className="ml-auto flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-neutral-700">
            {t("documentTone")}
          </span>
          <div className="inline-flex overflow-hidden rounded-md border border-neutral-200 bg-white">
            {(["professional", "friendly", "minimal"] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => setField("documentTone", tone)}
                disabled={!canEdit}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60",
                  form.documentTone === tone
                    ? "bg-primary-50 text-primary-700"
                    : "text-neutral-600 hover:bg-neutral-50",
                )}
              >
                {t(`tone.${tone}` as never)}
              </button>
            ))}
          </div>
          <span className="max-w-[300px] text-[11px] leading-[1.5] text-neutral-500">
            {t("toneHint")}
          </span>
        </div>
      </div>

      <HR />

      {/* Operational locations */}
      <SubH
        right={
          canEdit && (
            <button
              type="button"
              onClick={addLocation}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <PlusIcon /> {t("addLocation")}
            </button>
          )
        }
      >
        {t("operationalLocations")}
      </SubH>
      <div className="flex flex-col divide-y divide-neutral-100">
        {form.locations.length === 0 && (
          <div className="rounded-md border border-dashed border-neutral-200 px-4 py-6 text-center text-[12px] text-neutral-500">
            {t("noLocations")}
          </div>
        )}
        {form.locations.map((loc) => (
          <div
            key={loc.id}
            className="grid grid-cols-[1fr_auto] items-start gap-3 py-3"
          >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
              <input
                value={loc.name}
                onChange={(e) =>
                  updateLocation(loc.id, { name: e.target.value })
                }
                disabled={!canEdit}
                placeholder={t("locName")}
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] font-semibold text-neutral-800 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
              />
              <input
                value={loc.address}
                onChange={(e) =>
                  updateLocation(loc.id, { address: e.target.value })
                }
                disabled={!canEdit}
                placeholder={t("locAddress")}
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
              />
              <select
                value={loc.type}
                onChange={(e) =>
                  updateLocation(loc.id, {
                    type: e.target.value as LocationEntry["type"],
                  })
                }
                disabled={!canEdit}
                className={cn(
                  "rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em]",
                  loc.type === "hq"
                    ? "border-primary-200 bg-primary-50 text-primary-700"
                    : loc.type === "depot"
                      ? "border-secondary-200 bg-secondary-50 text-secondary-700"
                      : "border-warning-300 bg-warning-50 text-warning-700",
                )}
              >
                <option value="hq">{t("locType.hq")}</option>
                <option value="depot">{t("locType.depot")}</option>
                <option value="satellite">{t("locType.satellite")}</option>
              </select>
            </div>
            {canEdit && loc.type !== "hq" && (
              <button
                type="button"
                onClick={() => removeLocation(loc.id)}
                className="rounded-md border border-error-100 bg-white px-2 py-1.5 text-[11px] font-semibold text-error-700 hover:bg-error-50"
              >
                {t("remove")}
              </button>
            )}
          </div>
        ))}
      </div>

      <SaveBar pending={pending} onSave={onSave} canEdit={canEdit} />
    </Card>
  );
}

/* ============================================================================
 *  02 · TEAM & ROLES
 * ========================================================================== */

function TeamSection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings.team");
  const [inviteOpen, setInviteOpen] = useState(false);

  const CAPS: Array<{
    keyMain: string;
    keyDesc: string;
    cells: Array<"y" | "n" | { p: string }>;
  }> = [
    {
      keyMain: "capViewPlan",
      keyDesc: "capViewPlanDesc",
      cells: ["y", "y", "y", { p: "own" }],
    },
    {
      keyMain: "capAssign",
      keyDesc: "capAssignDesc",
      cells: ["y", "y", "n", "n"],
    },
    {
      keyMain: "capManageClients",
      keyDesc: "capManageClientsDesc",
      cells: ["y", { p: "read" }, "n", "n"],
    },
    {
      keyMain: "capInvoicing",
      keyDesc: "capInvoicingDesc",
      cells: ["y", "n", "n", "n"],
    },
    {
      keyMain: "capApproveTime",
      keyDesc: "capApproveTimeDesc",
      cells: ["y", "y", "n", "n"],
    },
    {
      keyMain: "capReports",
      keyDesc: "capReportsDesc",
      cells: ["y", { p: "ltd" }, "n", { p: "own" }],
    },
    {
      keyMain: "capOrgSettings",
      keyDesc: "capOrgSettingsDesc",
      cells: ["y", "n", "n", "n"],
    },
  ];

  function exportCsv() {
    // Lightweight client-side CSV export of the visible members list.
    // The Team card backs onto the full Employees module for real
    // exports — this is the same "snapshot of who's here" you'd send
    // to an auditor as a one-off.
    const rows = [
      ["id", "full_name", "role", "email"],
      ...data.members.map((m) => [
        m.id,
        m.full_name,
        m.role,
        m.email ?? "",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((cell) =>
            /["\n,]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
          )
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card
        num={t("badge")}
        area="mgmt"
        title={t("title")}
        subtitle={t("subtitleN", { n: data.members.length })}
        actions={
          <>
            <button
              type="button"
              onClick={exportCsv}
              className="btn btn--ghost border border-neutral-200 bg-white btn--sm"
            >
              {t("export")}
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="btn btn--primary btn--sm"
            >
              <PlusIcon /> {t("invite")}
            </button>
          </>
        }
      >
        <SubH>{t("matrixTitle")}</SubH>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                  {t("capability")}
                </th>
                {(["mgmt", "sup", "empl", "client"] as const).map((r) => (
                  <th
                    key={r}
                    className="w-[18%] px-2 py-2 text-center text-[11px] font-bold uppercase"
                  >
                    <span
                      className={cn(
                        r === "mgmt" && "text-primary-700",
                        r === "sup" && "text-secondary-700",
                        r === "empl" && "text-success-700",
                        r === "client" && "text-warning-700",
                      )}
                    >
                      {t(`role.${r}` as never)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPS.map((row, idx) => (
                <tr key={idx} className="border-t border-neutral-100">
                  <td className="py-3 pr-3 align-top text-[13px] font-medium text-neutral-800">
                    {t(row.keyMain as never)}
                    <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">
                      {t(row.keyDesc as never)}
                    </span>
                  </td>
                  {row.cells.map((c, i) => (
                    <td key={i} className="py-3 text-center align-middle">
                      <CheckCell cell={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <HR />

        <SubH
          right={
            <Link
              href={routes.employees}
              className="text-[12px] font-semibold text-primary-700 hover:underline"
            >
              {t("seeAll")} →
            </Link>
          }
        >
          {t("activeMembers", { n: data.members.length })}
        </SubH>
        <div className="flex flex-col divide-y divide-neutral-100">
          {data.members.slice(0, 6).map((m, i) => (
            <div
              key={m.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-1 py-2.5"
            >
              <span
                className={cn(
                  "grid h-[34px] w-[34px] place-items-center rounded-full text-[11px] font-bold text-white",
                  AVATAR_BG[i % AVATAR_BG.length],
                )}
              >
                {initials(m.full_name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-neutral-800">
                  {m.full_name}
                </div>
                <div className="truncate text-[11px] text-neutral-500">
                  {m.email ?? "—"}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  m.role === "admin"
                    ? "bg-primary-50 text-primary-700"
                    : m.role === "dispatcher"
                      ? "bg-secondary-50 text-secondary-700"
                      : "bg-success-50 text-success-700",
                )}
              >
                {t(
                  `role.${m.role === "admin" ? "mgmt" : m.role === "dispatcher" ? "sup" : "empl"}` as never,
                )}
              </span>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-700"
                aria-label={t("memberMenu")}
              >
                <KebabIcon />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <InviteEmployeeDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}

const AVATAR_BG = [
  "bg-primary-500",
  "bg-secondary-500",
  "bg-warning-500",
  "bg-accent-600",
  "bg-secondary-600",
  "bg-neutral-600",
] as const;

function CheckCell({ cell }: { cell: "y" | "n" | { p: string } }) {
  if (cell === "y")
    return (
      <span className="inline-grid h-[22px] w-[22px] place-items-center rounded-md bg-success-50 text-success-700">
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  if (cell === "n")
    return (
      <span className="inline-grid h-[22px] w-[22px] place-items-center rounded-md bg-neutral-100 text-neutral-400">
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <line x1={18} y1={6} x2={6} y2={18} />
          <line x1={6} y1={6} x2={18} y2={18} />
        </svg>
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md bg-warning-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-warning-700">
      {cell.p}
    </span>
  );
}

/* ============================================================================
 *  03 · TAX & BILLING
 *
 *  Adds vs. previous version:
 *    - Legal name + IBAN fields
 *    - Reduced-rate auto-apply toggle
 *    - Late-payment reminder toggle
 *    - Invoice footer textarea
 * ========================================================================== */

function TaxSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.tax");
  const router = useRouter();
  const [pending, start] = useTransition();
  const tax = (data.data.tax ?? {}) as Record<string, unknown>;

  const initial = useMemo(
    () => ({
      legalName: String(tax.legalName ?? data.org.name ?? ""),
      vatId: String(tax.vatId ?? ""),
      vatRate: String(tax.vatRate ?? "19"),
      currency: String(tax.currency ?? "EUR"),
      invoicePrefix: String(tax.invoicePrefix ?? "INV-{YYYY}-{####}"),
      paymentTerms: String(tax.paymentTerms ?? "14"),
      lateFee: String(tax.lateFee ?? "5"),
      iban: String(tax.iban ?? ""),
      reducedAutoApply: Boolean(tax.reducedAutoApply ?? true),
      lateReminderEnabled: Boolean(tax.lateReminderEnabled ?? true),
      invoiceFooter: String(tax.invoiceFooter ?? t("defaultInvoiceFooter")),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const [form, setForm] = useState(initial);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = useCallback(async () => {
    const r = await updateSettingsAction({ tax: form });
    if (!r.ok) {
      toast.error(r.error);
      throw new Error(r.error);
    }
    toast.success(t("savedToast"));
    router.refresh();
  }, [form, router, t]);
  const discard = useCallback(() => setForm(initial), [initial]);

  const { markDirty } = useRegisterSection("tax", {
    save,
    discard,
    label: t("title"),
  });
  useEffect(() => {
    markDirty(isDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSave() {
    start(async () => {
      try {
        await save();
      } catch {
        /* toasted */
      }
    });
  }

  return (
    <Card num={t("badge")} area="mgmt" title={t("title")} subtitle={t("subtitle")}>
      {/* Current plan */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-5 rounded-lg border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-700">
            ● {t("currentPlan")}
          </div>
          <div className="text-[19px] font-bold tracking-[-0.01em]">
            {t("planTier")}
            <small className="ml-2 text-[12px] font-medium text-neutral-500">
              · {t("planTierSub")}
            </small>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-5 text-[12px]">
            <PlanStat value={`${data.members.length} / 50`} label={t("planMembers")} />
            <PlanStat value="10 / 20" label={t("planObjects")} />
            <PlanStat value={t("unlimited")} label={t("planInvoices")} />
            <PlanStat value="48 / 40" label={t("planSeats")} />
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[26px] font-bold tracking-[-0.02em]">
            €149
          </div>
          <div className="text-[12px] text-neutral-500">{t("perMonth")}</div>
          <button className="btn btn--primary btn--sm mt-2">
            {t("managePlan")}
          </button>
        </div>
      </div>

      <HR />

      <SubH>{t("vatCompliance")}</SubH>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("legalName")}>
          <Input
            value={form.legalName}
            onChange={(e) => setField("legalName", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("vatId")}>
          <Input
            mono
            value={form.vatId}
            onChange={(e) => setField("vatId", e.target.value)}
            disabled={!canEdit}
            placeholder="DE 312 540 981"
          />
        </Field>
        <Field label={t("vatRate")}>
          <Select
            value={form.vatRate}
            onChange={(e) => setField("vatRate", e.target.value)}
            disabled={!canEdit}
          >
            <option value="19">{t("vatStd")} · 19 %</option>
            <option value="7">{t("vatReduced")} · 7 %</option>
          </Select>
        </Field>
        <Field label={t("iban")}>
          <Input
            mono
            value={form.iban}
            onChange={(e) => setField("iban", e.target.value)}
            disabled={!canEdit}
            placeholder="DE89 3704 0044 0532 0130 00"
          />
        </Field>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-[12px] text-neutral-700">
        <Toggle
          on={form.reducedAutoApply}
          onClick={() => setField("reducedAutoApply", !form.reducedAutoApply)}
          disabled={!canEdit}
        />
        <div>
          <b className="text-neutral-800">{t("reducedAutoApply")}</b>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {t("reducedAutoApplyHint")}
          </p>
        </div>
      </div>

      <HR />

      <SubH>{t("invoiceDefaults")}</SubH>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("invoicePrefix")}>
          <Input
            mono
            value={form.invoicePrefix}
            onChange={(e) => setField("invoicePrefix", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("paymentTerms")}>
          <Select
            value={form.paymentTerms}
            onChange={(e) => setField("paymentTerms", e.target.value)}
            disabled={!canEdit}
          >
            <option value="14">{t("net14")}</option>
            <option value="7">{t("net7")}</option>
            <option value="30">{t("net30")}</option>
          </Select>
        </Field>
        <Field label={t("currency")}>
          <Select
            value={form.currency}
            onChange={(e) => setField("currency", e.target.value)}
            disabled={!canEdit}
          >
            <option value="EUR">EUR · €</option>
          </Select>
        </Field>
        <Field label={t("lateFee")}>
          <Input
            type="number"
            step="0.01"
            value={form.lateFee}
            onChange={(e) => setField("lateFee", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-[12px] text-neutral-700">
        <Toggle
          on={form.lateReminderEnabled}
          onClick={() =>
            setField("lateReminderEnabled", !form.lateReminderEnabled)
          }
          disabled={!canEdit}
        />
        <div>
          <b className="text-neutral-800">{t("lateReminder")}</b>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {t("lateReminderHint")}
          </p>
        </div>
      </div>

      <HR />

      <SubH>{t("invoiceFooter")}</SubH>
      <textarea
        value={form.invoiceFooter}
        onChange={(e) => setField("invoiceFooter", e.target.value)}
        disabled={!canEdit}
        rows={3}
        className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 font-mono text-[11px] leading-[1.5] text-neutral-700 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
      />
      <p className="mt-1.5 text-[11px] text-neutral-500">
        {t("invoiceFooterHint")}
      </p>

      <SaveBar pending={pending} onSave={onSave} canEdit={canEdit} />
    </Card>
  );
}

function PlanStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="block font-mono text-[14px] font-bold text-neutral-800">{value}</b>
      <span className="text-neutral-500">{label}</span>
    </div>
  );
}

/* ============================================================================
 *  04 · INTEGRATIONS (marketplace)
 *
 *  Renamed integrations to match the prototype's 6 partners:
 *    - DATEV (active)
 *    - Stripe (active)
 *    - GDPR Direct GmbH (audit pending)
 *    - Google Calendar (not connected)
 *    - Slack (not connected)
 *    - QuickBooks (waitlist)
 * ========================================================================== */

const INTEGRATIONS = [
  {
    id: "datev",
    logo: "D",
    tone: "bg-[#1F6FEB]",
    status: "active" as const,
  },
  {
    id: "stripe",
    logo: "S",
    tone: "bg-[#635BFF]",
    status: "active" as const,
  },
  {
    id: "gdpr",
    logo: "G",
    tone: "bg-[#A8324B]",
    status: "audit" as const,
  },
  {
    id: "google",
    logo: "C",
    tone: "bg-[#EA4335]",
    status: "off" as const,
  },
  {
    id: "slack",
    logo: "#",
    tone: "bg-[#4A154B]",
    status: "off" as const,
  },
  {
    id: "quickbooks",
    logo: "Q",
    tone: "bg-[#2CA01C]",
    status: "waitlist" as const,
  },
];

function IntegrationsSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.integrations");
  const router = useRouter();
  const [pending, start] = useTransition();
  const integrations = (data.data.integrations ?? {}) as Record<string, boolean>;

  function toggle(id: string, on: boolean) {
    start(async () => {
      const next = { ...integrations, [id]: on };
      const r = await updateSettingsAction({ integrations: next });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("savedToast"));
      router.refresh();
    });
  }

  const activeCount =
    Object.values(integrations).filter(Boolean).length || 2; // 2 active in mock

  return (
    <Card
      num={t("badge")}
      area="mgmt"
      title={t("title")}
      subtitle={t("subtitle", { active: activeCount, total: INTEGRATIONS.length })}
      actions={
        <Link
          href="#"
          className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-700"
        >
          {t("marketplace")} →
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((it) => {
          const on = !!integrations[it.id] || it.status === "active";
          const audit = it.status === "audit";
          const waitlist = it.status === "waitlist";
          return (
            <div
              key={it.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-md border p-3.5 transition",
                on
                  ? "border-primary-200 bg-gradient-to-b from-primary-50 to-transparent"
                  : audit
                    ? "border-warning-300 bg-warning-50"
                    : "border-neutral-200 bg-white hover:border-neutral-300",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-[14px] font-bold text-white",
                    it.tone,
                  )}
                >
                  {it.logo}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-neutral-800">
                    {t(`${it.id}.name` as never)}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {t(`${it.id}.tagline` as never)}
                  </div>
                </div>
                <IntegrationStatusChip
                  status={
                    on
                      ? "active"
                      : audit
                        ? "audit"
                        : waitlist
                          ? "waitlist"
                          : "off"
                  }
                />
              </div>
              <p className="min-h-[34px] text-[12px] leading-[1.45] text-neutral-500">
                {t(`${it.id}.desc` as never)}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                <span>
                  {on
                    ? t("recentlySynced")
                    : audit
                      ? t("auditPending")
                      : waitlist
                        ? t("waitlistNote")
                        : t("freeAllPlans")}
                </span>
                {!waitlist && (
                  <button
                    type="button"
                    onClick={() => toggle(it.id, !on)}
                    disabled={!canEdit || pending}
                    className="text-[12px] font-semibold text-primary-700 hover:underline disabled:opacity-50"
                  >
                    {on ? t("configure") : `${t("connect")} →`}
                  </button>
                )}
                {waitlist && (
                  <span className="text-[12px] font-semibold text-neutral-500">
                    {t("joinWaitlist")} →
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <HR />

      <SubH
        right={
          <Link
            href={routes.apiKeys}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <PlusIcon /> {t("manageKeys")}
          </Link>
        }
      >
        {t("apiKeysTitle")}
      </SubH>
      <div className="overflow-hidden rounded-md border border-neutral-200 text-[12px]">
        {[
          {
            scope: "production" as const,
            label: t("apiKeyProd"),
            mask: "sk_live_4••••••••••••••a3FB",
            last: t("apiKeyLastUsed", { ago: "19 Nov 12:48" }),
          },
          {
            scope: "sandbox" as const,
            label: t("apiKeySandbox"),
            mask: "sk_test_4••••••••••••••8c7D",
            last: t("apiKeyLastUsed", { ago: "2 Apr 09:14" }),
          },
        ].map((k, i) => (
          <div
            key={k.scope}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5",
              i > 0 && "border-t border-neutral-100",
            )}
          >
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]",
                k.scope === "production"
                  ? "bg-error-100 text-error-700"
                  : "bg-secondary-50 text-secondary-700",
              )}
            >
              {k.label}
            </span>
            <div className="min-w-0">
              <div className="truncate font-mono text-[12px] text-neutral-800">
                {k.mask}
              </div>
              <div className="mt-0.5 text-[10.5px] text-neutral-500">{k.last}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50">
                {t("rotate")}
              </button>
              <button className="rounded-md border border-error-100 bg-white px-2 py-1 text-[11px] font-semibold text-error-700 hover:bg-error-50">
                {t("revoke")}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-2.5 rounded-md border border-warning-500 bg-warning-50 px-3 py-2.5 text-[12px] text-warning-700">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
          <path d="M12 9v2m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
        <span>{t("apiKeysWarning")}</span>
      </div>
    </Card>
  );
}

function IntegrationStatusChip({
  status,
}: {
  status: "active" | "audit" | "off" | "waitlist";
}) {
  const t = useTranslations("settings.integrations");
  const map = {
    active: { tone: "bg-success-50 text-success-700", dot: "bg-success-500", label: t("active") },
    audit: { tone: "bg-warning-50 text-warning-700", dot: "bg-warning-500", label: t("auditChip") },
    waitlist: { tone: "bg-secondary-50 text-secondary-700", dot: "bg-secondary-500", label: t("waitlist") },
    off: { tone: "bg-neutral-100 text-neutral-500", dot: "bg-neutral-400", label: t("notConnected") },
  } as const;
  const s = map[status];
  return (
    <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", s.tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/* ============================================================================
 *  05 · NOTIFICATIONS
 *
 *  Re-layout to match prototype:
 *    - 3 channel columns: IN-APP / EMAIL / SMS-WA
 *    - 3 groups: Operations / Finance / Team
 *    - 8 events total
 *    - Quiet-hours editor in the footer
 * ========================================================================== */

function NotificationsSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingQuiet, setEditingQuiet] = useState(false);

  type Channel = "in_app" | "email" | "sms_wa";
  type Event =
    | "feature_pub"
    | "shift_change"
    | "missed_checkin"
    | "invoice_paid"
    | "invoice_overdue"
    | "finance_digest"
    | "vacation_request"
    | "training_expiring";

  const stored =
    (data.data.notifications ?? {}) as Partial<Record<Event, Record<Channel, boolean>>>;
  const quiet =
    ((data.data.quietHours as { start?: string; end?: string }) ??
      {}) as { start?: string; end?: string };

  const defaults: Record<Event, Record<Channel, boolean>> = {
    feature_pub: { in_app: true, email: false, sms_wa: false },
    shift_change: { in_app: true, email: true, sms_wa: true },
    missed_checkin: { in_app: true, email: true, sms_wa: true },
    invoice_paid: { in_app: true, email: true, sms_wa: false },
    invoice_overdue: { in_app: true, email: true, sms_wa: false },
    finance_digest: { in_app: false, email: true, sms_wa: false },
    vacation_request: { in_app: true, email: true, sms_wa: false },
    training_expiring: { in_app: true, email: true, sms_wa: false },
  };

  const noti: Record<Event, Record<Channel, boolean>> = {
    ...defaults,
    ...(stored as Record<Event, Record<Channel, boolean>>),
  };

  const [quietStart, setQuietStart] = useState(quiet.start ?? "23:00");
  const [quietEnd, setQuietEnd] = useState(quiet.end ?? "07:00");

  const groups: Array<{ id: string; events: Array<{ id: Event; key: string; desc: string }> }> = [
    {
      id: "ops",
      events: [
        { id: "feature_pub", key: "evFeaturePub", desc: "evFeaturePubDesc" },
        { id: "shift_change", key: "evShiftChange", desc: "evShiftChangeDesc" },
        { id: "missed_checkin", key: "evMissedCheckin", desc: "evMissedCheckinDesc" },
      ],
    },
    {
      id: "finance",
      events: [
        { id: "invoice_paid", key: "evInvoicePaid", desc: "evInvoicePaidDesc" },
        { id: "invoice_overdue", key: "evInvoiceOverdue", desc: "evInvoiceOverdueDesc" },
        { id: "finance_digest", key: "evFinanceDigest", desc: "evFinanceDigestDesc" },
      ],
    },
    {
      id: "team",
      events: [
        { id: "vacation_request", key: "evVacationRequest", desc: "evVacationRequestDesc" },
        { id: "training_expiring", key: "evTrainingExpiring", desc: "evTrainingExpiringDesc" },
      ],
    },
  ];

  const channels: Array<{ id: Channel; key: string }> = [
    { id: "in_app", key: "channelInApp" },
    { id: "email", key: "channelEmail" },
    { id: "sms_wa", key: "channelSmsWa" },
  ];

  function flip(ev: Event, ch: Channel, on: boolean) {
    start(async () => {
      const next = { ...noti, [ev]: { ...noti[ev], [ch]: on } };
      const r = await updateSettingsAction({ notifications: next });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("savedToast"));
      router.refresh();
    });
  }

  function saveQuiet() {
    start(async () => {
      const r = await updateSettingsAction({
        quietHours: { start: quietStart, end: quietEnd },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("savedToast"));
      setEditingQuiet(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PushToggleCard />
      <Card
        num={t("badge")}
        area="mgmt"
        title={t("title")}
        subtitle={t("subtitle")}
        footer={
          <>
            {editingQuiet ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[12px]"
                />
                <span>—</span>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[12px]"
                />
                <button
                  type="button"
                  onClick={saveQuiet}
                  disabled={pending}
                  className="btn btn--primary btn--sm"
                >
                  {t("saveQuiet")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingQuiet(false)}
                  className="btn btn--ghost border border-neutral-200 bg-white btn--sm"
                >
                  {t("cancel")}
                </button>
              </div>
            ) : (
              <>
                <span>
                  {t.rich("quietHoursRange", {
                    b: (c) => <b className="text-neutral-800">{c}</b>,
                    range: `${quietStart} – ${quietEnd}`,
                  })}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditingQuiet(true)}
                    className="font-semibold text-primary-700"
                  >
                    {t("editQuietHours")} →
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        {/* Header row */}
        <div className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2.5 border-b border-neutral-200 pb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-500">
          <span />
          {channels.map((c) => (
            <span key={c.id} className="text-center">
              {t(c.key as never)}
            </span>
          ))}
        </div>
        {groups.map((g) => (
          <div key={g.id} className="mt-3 first:mt-0">
            <div className="py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
              {t(`group.${g.id}` as never)}
            </div>
            {g.events.map((ev) => (
              <div
                key={ev.id}
                className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2.5 border-b border-neutral-100 py-2.5"
              >
                <div>
                  <div className="text-[12px] font-semibold text-neutral-700">
                    {t(ev.key as never)}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {t(ev.desc as never)}
                  </div>
                </div>
                {channels.map((c) => {
                  const on = noti[ev.id]?.[c.id] ?? false;
                  return (
                    <div key={c.id} className="flex justify-center">
                      <Toggle
                        on={on}
                        onClick={() => flip(ev.id, c.id, !on)}
                        disabled={!canEdit || pending}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "relative h-[19px] w-[34px] flex-shrink-0 rounded-full transition disabled:opacity-50",
        on ? "bg-primary-500" : "bg-neutral-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 block h-[15px] w-[15px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition",
          on ? "left-[17px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/* ============================================================================
 *  06 · MY ACCOUNT
 *
 *  Adds vs. previous version: Display name, Phone, Remove-photo button.
 * ========================================================================== */

function AccountSection({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.account");
  const router = useRouter();
  const [pending, start] = useTransition();
  const locale = (data.data.locale ?? {}) as Record<string, string>;
  const account = (data.data.account ?? {}) as Record<string, string>;
  const me = data.me;

  const initial = useMemo(
    () => ({
      fullName: me.full_name,
      displayName: account.displayName ?? me.full_name,
      email: me.email ?? "",
      phone: account.phone ?? "",
      language: locale.language ?? "de",
      timezone: locale.timezone ?? "Europe/Berlin",
      weekStart: locale.weekStart ?? "monday",
      dateFormat: locale.dateFormat ?? "dd.MM.yyyy",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const [form, setForm] = useState(initial);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = useCallback(async () => {
    const r = await updateSettingsAction({
      locale: {
        language: form.language,
        timezone: form.timezone,
        weekStart: form.weekStart,
        dateFormat: form.dateFormat,
      },
      account: {
        displayName: form.displayName,
        phone: form.phone,
      },
    });
    if (!r.ok) {
      toast.error(r.error);
      throw new Error(r.error);
    }
    toast.success(t("savedToast"));
    router.refresh();
  }, [form, router, t]);
  const discard = useCallback(() => setForm(initial), [initial]);

  const { markDirty } = useRegisterSection("account", {
    save,
    discard,
    label: t("title"),
  });
  useEffect(() => {
    markDirty(isDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function onSave() {
    start(async () => {
      try {
        await save();
      } catch {
        /* toasted */
      }
    });
  }

  return (
    <Card num={t("badge")} area="personal" title={t("title")} subtitle={t("subtitle")}>
      <div className="mb-5 grid grid-cols-[auto_1fr] items-center gap-5 border-b border-neutral-100 pb-5">
        <AvatarUpload
          initialUrl={me.avatar_url}
          initials={initials(form.fullName || "—")}
          fullName={form.fullName || me.email || "—"}
        />
        <div className="min-w-0">
          <div className="text-[16px] font-bold tracking-[-0.01em]">
            {form.displayName || form.fullName}
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-neutral-500">
            {form.email}
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-primary-700">
            {me.role}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("fullName")}>
          <Input value={form.fullName} disabled />
        </Field>
        <Field label={t("displayName")}>
          <Input
            value={form.displayName}
            onChange={(e) => setField("displayName", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("email")}>
          <Input value={form.email} disabled />
        </Field>
        <Field label={t("phone")}>
          <Input
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            disabled={!canEdit}
            placeholder="+49 30 123 4567"
          />
        </Field>
        <Field label={t("language")}>
          <Select
            value={form.language}
            onChange={(e) => setField("language", e.target.value)}
            disabled={!canEdit}
          >
            <option value="de">Deutsch (DE)</option>
            <option value="en">English (EN)</option>
            <option value="ta">தமிழ் (TA)</option>
          </Select>
        </Field>
        <Field label={t("timezone")}>
          <Input
            value={form.timezone}
            onChange={(e) => setField("timezone", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label={t("weekStart")}>
          <Select
            value={form.weekStart}
            onChange={(e) => setField("weekStart", e.target.value)}
            disabled={!canEdit}
          >
            <option value="monday">{t("monday")}</option>
            <option value="sunday">{t("sunday")}</option>
          </Select>
        </Field>
        <Field label={t("dateFormat")}>
          <Input
            value={form.dateFormat}
            onChange={(e) => setField("dateFormat", e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <SaveBar pending={pending} onSave={onSave} canEdit={canEdit} />
    </Card>
  );
}

/* ============================================================================
 *  07 · SECURITY
 *
 *  Wraps the existing SecuritySection (TOTP enrolment + disable) and adds
 *  the prototype's "login alerts" toggle stored in settings.data.security.
 * ========================================================================== */

function SecurityWrap({
  data,
  canEdit,
}: {
  data: SettingsData;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.security");
  const router = useRouter();
  const [pending, start] = useTransition();
  const sec = (data.data.security ?? {}) as Record<string, unknown>;
  const [loginAlerts, setLoginAlerts] = useState<boolean>(
    Boolean(sec.loginAlerts ?? true),
  );

  function flipLoginAlerts(next: boolean) {
    setLoginAlerts(next);
    start(async () => {
      const r = await updateSettingsAction({
        security: { ...sec, loginAlerts: next },
      });
      if (!r.ok) {
        toast.error(r.error);
        setLoginAlerts(!next);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card
      num={t("badge")}
      area="personal"
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-success-700">
          {t("strongScore")}
        </span>
      }
    >
      <SecuritySection hideHeader />

      <HR />

      <div className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-md border border-neutral-100 p-4">
        <div>
          <b className="block text-[13px] text-neutral-800">{t("loginAlerts")}</b>
          <p className="mt-1 text-[12px] text-neutral-500">
            {t("loginAlertsHint")}
          </p>
        </div>
        <Toggle
          on={loginAlerts}
          onClick={() => flipLoginAlerts(!loginAlerts)}
          disabled={!canEdit || pending}
        />
      </div>
    </Card>
  );
}

/* ============================================================================
 *  08 · SESSIONS & DEVICES (live)
 * ========================================================================== */

type DeviceRow = {
  id: string;
  device_label: string;
  device_kind: "desktop" | "mobile" | "tablet" | "unknown";
  geo_label: string | null;
  last_seen_at: string;
  isCurrent: boolean;
};

function SessionsSection() {
  const t = useTranslations("settings.sessions");
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [pending, start] = useTransition();

  // Live fetch on mount. The dashboard layout already upserts the
  // current device on every navigation; here we just read what's
  // currently active for this user.
  useEffect(() => {
    let cancelled = false;
    listDevicesAction().then((r) => {
      if (cancelled) return;
      if (r.ok) setDevices(r.devices.map(toRow));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function signOutOthers() {
    if (!confirm(t("revokeAllConfirm"))) return;
    start(async () => {
      const r = await signOutOtherDevicesAction();
      if (r.ok) {
        toast.success(t("revokeAllSuccess"));
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function revokeOne(id: string) {
    start(async () => {
      const r = await revokeDeviceAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("revoked"));
      // Optimistically drop from the list.
      setDevices((d) => (d ?? []).filter((x) => x.id !== id));
    });
  }

  return (
    <Card
      num={t("badge")}
      area="personal"
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <button
          type="button"
          onClick={signOutOthers}
          disabled={pending}
          className="btn btn--ghost border border-error-100 bg-white text-error-700 hover:bg-error-50 btn--sm disabled:opacity-50"
        >
          {pending ? t("revokeAllPending") : t("revokeAll")}
        </button>
      }
      footer={
        <>
          <span>{t("footerCount", { count: devices?.length ?? 0 })}</span>
          <a href="#" className="font-semibold text-primary-700">
            {t("auditLog")} →
          </a>
        </>
      }
    >
      <div className="flex flex-col divide-y divide-neutral-100">
        {devices === null && (
          <div className="px-1 py-6 text-center text-[12px] text-neutral-500">
            {t("loading")}
          </div>
        )}
        {devices?.length === 0 && (
          <div className="px-1 py-6 text-center text-[12px] text-neutral-500">
            {t("noDevices")}
          </div>
        )}
        {(devices ?? []).map((d) => (
          <div
            key={d.id}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-3"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700">
              <DeviceIcon kind={d.device_kind} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-neutral-800">
                <span className="truncate">{d.device_label}</span>
                {d.isCurrent && (
                  <span className="rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-success-700">
                    {t("thisDevice")}
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[11px] text-neutral-500">
                🇩🇪 {d.geo_label ?? t("geoUnknown")}
              </div>
            </div>
            <div className="text-[11px] text-neutral-500">
              {d.isCurrent ? t("activeNow") : relativeTime(d.last_seen_at, t)}
            </div>
            {!d.isCurrent ? (
              <button
                type="button"
                onClick={() => revokeOne(d.id)}
                disabled={pending}
                className="rounded-md border border-error-100 bg-white px-2 py-1 text-[11px] font-semibold text-error-700 hover:bg-error-50 disabled:opacity-50"
              >
                {t("revoke")}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function toRow(d: {
  id: string;
  device_label: string;
  device_kind: DeviceRow["device_kind"];
  geo_label: string | null;
  last_seen_at: string;
  isCurrent: boolean;
}): DeviceRow {
  return {
    id: d.id,
    device_label: d.device_label,
    device_kind: d.device_kind,
    geo_label: d.geo_label,
    last_seen_at: d.last_seen_at,
    isCurrent: d.isCurrent,
  };
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.round(diff / 60_000);
  if (m < 1) return t("activeNow");
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} d`;
}

function DeviceIcon({
  kind,
}: {
  kind: DeviceRow["device_kind"];
}) {
  if (kind === "mobile") {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x={6} y={2} width={12} height={20} rx={2} />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  if (kind === "tablet") {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3} y={2} width={18} height={20} rx={2} />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2} y={3} width={20} height={14} rx={2} />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/* ============================================================================
 *  SHARED INPUTS / ICONS
 * ========================================================================== */

function Input({
  mono,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      {...rest}
      className={cn(
        "rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60",
        mono && "font-mono text-[12px]",
        className,
      )}
    />
  );
}

function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-60",
        className,
      )}
    >
      {children}
    </select>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={1} />
      <circle cx={19} cy={12} r={1} />
      <circle cx={5} cy={12} r={1} />
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
