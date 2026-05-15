"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { routes } from "@/lib/constants/routes";
import { createDraftInvoiceAction } from "@/app/actions/invoice-draft";

type ClientOption = {
  id: string;
  display_name: string;
  customer_type: "residential" | "commercial" | "alltagshilfe";
  email: string | null;
  billing_email: string | null;
};

const CUSTOMER_LABEL: Record<ClientOption["customer_type"], string> = {
  residential: "Regulär",
  commercial: "Gewerblich",
  alltagshilfe: "Alltagshilfe",
};

/**
 * 2-step wizard: pick a client + date range → backend aggregates approved
 * shifts into a draft invoice → redirect to the draft editor.
 */
export function NewInvoiceWizard({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [clientId, setClientId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [groupBy, setGroupBy] = useState<"property_employee" | "property" | "shift">(
    "property_employee",
  );

  const filtered = useMemo(
    () =>
      clients.filter((c) =>
        c.display_name.toLowerCase().includes(filter.toLowerCase().trim()),
      ),
    [clients, filter],
  );
  const selected = clients.find((c) => c.id === clientId) ?? null;

  function submit() {
    if (!clientId) {
      toast.error("Bitte einen Kunden auswählen.");
      return;
    }
    if (periodEnd < periodStart) {
      toast.error("Der Zeitraum ist ungültig.");
      return;
    }
    start(async () => {
      const r = await createDraftInvoiceAction({
        clientId,
        periodStart,
        periodEnd,
        groupBy,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Entwurf ${r.data.invoiceNumber} erstellt.`);
      router.push(routes.invoice(r.data.invoiceId));
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-secondary-700">Neue Rechnung</h1>
        <p className="text-sm text-neutral-500">
          Wähle einen Kunden und einen Abrechnungszeitraum. Das System
          sammelt alle freigegebenen Zeiterfassungen in diesem Zeitraum und
          schlägt einen Rechnungsentwurf vor.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-[2fr_3fr]">
        {/* --- Step 1: pick client --- */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-700">1. Kunde</h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Kundensuche…"
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-300"
          />
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-sm text-neutral-500">
                Keine Kunden gefunden.
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setClientId(c.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                      clientId === c.id
                        ? "border-secondary-500 bg-secondary-50"
                        : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="truncate font-medium text-neutral-800">
                      {c.display_name}
                    </span>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        c.customer_type === "alltagshilfe"
                          ? "bg-primary-50 text-primary-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {CUSTOMER_LABEL[c.customer_type]}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* --- Step 2: pick range + group --- */}
        <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-700">2. Zeitraum</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-neutral-600">Von</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary-300"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Bis</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary-300"
              />
            </label>
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="text-neutral-600">Gruppierung</legend>
            {(
              [
                ["property_employee", "Pro Objekt × Mitarbeiter (Standard)"],
                ["property", "Pro Objekt"],
                ["shift", "Pro Schicht"],
              ] as const
            ).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="groupBy"
                  checked={groupBy === val}
                  onChange={() => setGroupBy(val)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <h2 className="text-sm font-semibold text-neutral-700">3. Vorschau</h2>
          <p className="text-sm text-neutral-600">
            Kunde: <span className="font-medium">{selected?.display_name ?? "—"}</span>
            <br />
            Typ: {selected ? CUSTOMER_LABEL[selected.customer_type] : "—"}
            <br />
            Zeitraum: {periodStart} → {periodEnd}
          </p>

          <button
            type="button"
            onClick={submit}
            disabled={pending || !clientId}
            className="w-full rounded-md bg-secondary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-secondary-600 disabled:opacity-50"
          >
            {pending ? "Erstelle Entwurf…" : "Entwurf erzeugen"}
          </button>
        </div>
      </section>
    </div>
  );
}
