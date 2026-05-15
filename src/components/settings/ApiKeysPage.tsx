"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type ApiKeyListRow,
} from "@/app/actions/api-keys";
import { V1_SCOPES, type V1Scope } from "@/lib/api/v1-scopes";

type Props = { keys: ApiKeyListRow[] };

/** UI status derived from the row's date columns. */
function statusOf(row: ApiKeyListRow): "active" | "revoked" | "expired" {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  return "active";
}

export function ApiKeysPage({ keys }: Props) {
  const t = useTranslations("apiKeys");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<V1Scope[]>(["read:clients"]);
  const [expires, setExpires] = useState("");

  function toggleScope(s: V1Scope) {
    setScopes((curr) =>
      curr.includes(s) ? curr.filter((c) => c !== s) : [...curr, s],
    );
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createApiKeyAction({
        name,
        scopes,
        expires_at: expires ? new Date(expires).toISOString() : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSecret(res.data.key);
      setName("");
      router.refresh();
    });
  }

  function handleRevoke(id: string) {
    if (!window.confirm(t("revokeConfirm"))) return;
    startTransition(async () => {
      const res = await revokeApiKeyAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("revoked"));
      router.refresh();
    });
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {tCommon("appName")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.settings} className="hover:text-neutral-700">
          {t("settingsLink")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("title")}</span>
      </nav>

      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setSecret(null);
          }}
          className="rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-600"
        >
          {t("createButton")}
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-neutral-50 text-[12px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colName")}</th>
              <th className="px-4 py-3 font-medium">{t("colPrefix")}</th>
              <th className="px-4 py-3 font-medium">{t("lastUsed")}</th>
              <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("colCreated")}</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-[13px] text-neutral-500"
                >
                  {t("emptyState")}
                </td>
              </tr>
            ) : (
              keys.map((k) => {
                const status = statusOf(k);
                return (
                  <tr key={k.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {k.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-600">
                      {k.prefix}…
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleString()
                        : t("never")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                          status === "active" &&
                            "bg-emerald-100 text-emerald-700",
                          status === "revoked" &&
                            "bg-neutral-200 text-neutral-700",
                          status === "expired" &&
                            "bg-amber-100 text-amber-800",
                        )}
                      >
                        {t(`status.${status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === "active" ? (
                        <button
                          type="button"
                          onClick={() => handleRevoke(k.id)}
                          disabled={pending}
                          className="text-[12px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {t("revoke")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {showCreate ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!secret) setShowCreate(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
          >
            {secret ? (
              <>
                <h2 className="mb-2 text-[17px] font-bold text-secondary-500">
                  {t("createdTitle")}
                </h2>
                <p className="mb-4 text-[13px] text-neutral-600">
                  {t("secretShownOnce")}
                </p>
                <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[12px] text-neutral-800">
                  {secret}
                </pre>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(secret);
                      toast.success(t("copied"));
                    }}
                    className="rounded-md border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    {t("copy")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setSecret(null);
                    }}
                    className="rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-600"
                  >
                    {t("done")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-[17px] font-bold text-secondary-500">
                  {t("createDialogTitle")}
                </h2>
                <p className="mb-4 text-[13px] text-neutral-500">
                  {t("createDialogSubtitle")}
                </p>

                <label className="mb-4 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-neutral-700">
                    {t("fieldName")}
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("fieldNamePlaceholder")}
                    className="rounded-md border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-primary-400"
                  />
                </label>

                <fieldset className="mb-4">
                  <legend className="mb-2 text-[13px] font-medium text-neutral-700">
                    {t("fieldScopes")}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {V1_SCOPES.map((s) => (
                      <label
                        key={s}
                        className="flex items-center gap-2 text-[12px] text-neutral-700"
                      >
                        <input
                          type="checkbox"
                          checked={scopes.includes(s)}
                          onChange={() => toggleScope(s)}
                        />
                        <span className="font-mono">{s}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="mb-5 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-neutral-700">
                    {t("fieldExpires")}
                  </span>
                  <input
                    type="date"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value)}
                    className="rounded-md border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-primary-400"
                  />
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-md border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    {tCommon("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={pending || !name || scopes.length === 0}
                    className="rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
                  >
                    {t("create")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
