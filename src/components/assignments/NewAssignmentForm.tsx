"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { routes } from "@/lib/constants/routes";
import { upsertAssignmentAction } from "@/app/actions/assignments";

type ClientOption = { id: string; display_name: string };
type PropertyOption = { id: string; name: string; client_id: string };
type EmployeeOption = { id: string; full_name: string };

type StaffRow = { employeeId: string; allocatedHours: string };

type Props = {
  clients: ClientOption[];
  properties: PropertyOption[];
  employees: EmployeeOption[];
};

export function NewAssignmentForm({ clients, properties, employees }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [propertyId, setPropertyId] = useState("");
  const [hoursPerPeriod, setHoursPerPeriod] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [hourlyRateEur, setHourlyRateEur] = useState("");
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);

  const filteredProperties = clientId
    ? properties.filter((p) => p.client_id === clientId)
    : properties;

  function addStaff() {
    const unused = employees.find((e) => !staff.some((s) => s.employeeId === e.id));
    if (!unused) return;
    setStaff((prev) => [...prev, { employeeId: unused.id, allocatedHours: "" }]);
  }

  function updateStaffEmployee(idx: number, employeeId: string) {
    setStaff((prev) => prev.map((s, i) => (i === idx ? { ...s, employeeId } : s)));
  }

  function updateStaffHours(idx: number, h: string) {
    setStaff((prev) => prev.map((s, i) => (i === idx ? { ...s, allocatedHours: h } : s)));
  }

  function removeStaff(idx: number) {
    setStaff((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { toast.error("Bitte Kunden wählen."); return; }
    if (!propertyId) { toast.error("Bitte Objekt wählen."); return; }
    const hours = parseFloat(hoursPerPeriod);
    if (!hours || hours <= 0) { toast.error("Gültige Stundenzahl eingeben."); return; }

    const staffParsed = staff
      .filter((s) => s.employeeId && s.allocatedHours)
      .map((s) => ({ employeeId: s.employeeId, allocatedHours: parseFloat(s.allocatedHours) }))
      .filter((s) => s.allocatedHours > 0);

    const rateRaw = hourlyRateEur.trim();
    const hourlyRateCents = rateRaw === "" ? null : Math.round(parseFloat(rateRaw) * 100);

    start(async () => {
      const result = await upsertAssignmentAction({
        clientId,
        propertyId,
        hoursPerPeriod: hours,
        frequency,
        hourlyRateCents,
        startsOn,
        endsOn: endsOn || null,
        active: true,
        notes: notes || null,
        staff: staffParsed,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Auftrag gespeichert.");
      router.replace(routes.assignment(result.data.id));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid place-items-center py-4" noValidate>
      <div className="w-full max-w-[820px] space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={routes.assignments}
              className="text-xs text-neutral-500 hover:text-neutral-700"
            >
              ← Aufträge
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-secondary-700">
              Neuer Auftrag
            </h1>
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-neutral-100 bg-white p-7 shadow-sm">

          {/* Client + Property */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Zuordnung
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">
                  Kunde <span className="text-error-500">*</span>
                </span>
                <select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setPropertyId("");
                  }}
                  className="input"
                  required
                >
                  <option value="">— Kunde wählen —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">
                  Objekt <span className="text-error-500">*</span>
                </span>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="input"
                  required
                  disabled={!clientId}
                >
                  <option value="">— Objekt wählen —</option>
                  {filteredProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <hr className="mb-6 border-neutral-100" />

          {/* Hours + Rate + Frequency */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Leistungsumfang
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">
                  Stunden/Periode <span className="text-error-500">*</span>
                </span>
                <input
                  type="number"
                  min="0.5"
                  max="168"
                  step="0.5"
                  value={hoursPerPeriod}
                  onChange={(e) => setHoursPerPeriod(e.target.value)}
                  className="input"
                  placeholder="z.B. 8"
                  required
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">Rhythmus</span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                  className="input"
                >
                  <option value="weekly">Wöchentlich</option>
                  <option value="biweekly">14-tägig</option>
                  <option value="monthly">Monatlich</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">
                  Stundensatz (€)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRateEur}
                  onChange={(e) => setHourlyRateEur(e.target.value)}
                  className="input"
                  placeholder="z.B. 25.00"
                />
              </label>
            </div>
          </fieldset>

          <hr className="mb-6 border-neutral-100" />

          {/* Dates */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Laufzeit
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">
                  Beginn <span className="text-error-500">*</span>
                </span>
                <input
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className="input"
                  required
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">Ende (optional)</span>
                <input
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="input"
                  min={startsOn}
                />
              </label>
            </div>
          </fieldset>

          <hr className="mb-6 border-neutral-100" />

          {/* Staff */}
          <fieldset className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <legend className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Personalverteilung (optional)
              </legend>
              <button
                type="button"
                onClick={addStaff}
                disabled={staff.length >= employees.length}
                className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
              >
                + Mitarbeiter hinzufügen
              </button>
            </div>

            {staff.length === 0 && (
              <p className="text-sm text-neutral-400">
                Noch keine Mitarbeiter zugeordnet.
              </p>
            )}

            <div className="space-y-2">
              {staff.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={s.employeeId}
                    onChange={(e) => updateStaffEmployee(idx, e.target.value)}
                    className="input flex-1"
                  >
                    {employees.map((e) => (
                      <option
                        key={e.id}
                        value={e.id}
                        disabled={
                          e.id !== s.employeeId &&
                          staff.some((row) => row.employeeId === e.id)
                        }
                      >
                        {e.full_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.5"
                    max="168"
                    step="0.5"
                    value={s.allocatedHours}
                    onChange={(e) => updateStaffHours(idx, e.target.value)}
                    className="input w-24"
                    placeholder="Std."
                  />
                  <button
                    type="button"
                    onClick={() => removeStaff(idx)}
                    className="text-neutral-400 hover:text-error-500"
                    aria-label="Entfernen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <hr className="mb-6 border-neutral-100" />

          {/* Notes */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Notizen
            </legend>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[80px] w-full resize-y"
              placeholder="Interne Notizen zum Auftrag…"
              maxLength={2000}
            />
          </fieldset>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link
              href={routes.assignments}
              className="rounded-md border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              Abbrechen
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-secondary-500 px-5 py-2 text-sm font-medium text-white hover:bg-secondary-600 disabled:opacity-60"
            >
              {pending ? "Speichern…" : "Auftrag anlegen"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
