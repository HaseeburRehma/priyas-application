"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createChannelAction,
  createGroupAction,
  startDirectMessageAction,
} from "@/app/actions/chat-channels";
import { routes } from "@/lib/constants/routes";

type Mode = "channel" | "direct" | "group";

type Props = {
  mode: Mode;
  open: boolean;
  onClose: () => void;
};

type Teammate = {
  id: string;
  full_name: string;
  role: string | null;
};

/**
 * Single dialog that handles all three create-conversation flows:
 *  - mode="channel" → name + description + private toggle + initial members
 *  - mode="direct"  → pick exactly one teammate → routes to /chat/<id>
 *  - mode="group"   → name + ≥1 member
 *
 * Loads teammates on first open from `profiles` (filtered to the same org
 * via RLS) and presents them as a checkbox list with a search filter.
 */
export function NewChannelDialog({ mode, open, onClose }: Props) {
  const t = useTranslations("chat.dialog");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Load teammates on open.
  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setIsPrivate(false);
    setPicked(new Set());
    setFilter("");
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .neq("id", user?.id ?? "")
        .order("full_name", { ascending: true });
      setTeammates((data ?? []) as Teammate[]);
    })();
  }, [open]);

  if (!open) return null;

  const filteredTeammates = filter.trim()
    ? teammates.filter((tm) =>
        tm.full_name.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : teammates;

  function togglePick(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (mode === "direct") {
        n.clear();
        n.add(id);
      } else n.add(id);
      return n;
    });
  }

  function submit() {
    start(async () => {
      if (mode === "direct") {
        const target = Array.from(picked)[0];
        if (!target) {
          toast.error(t("pickOne"));
          return;
        }
        const r = await startDirectMessageAction(target);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        onClose();
        router.push(`${routes.chat}/${r.data.id}` as never);
        router.refresh();
        return;
      }

      if (mode === "channel") {
        if (name.trim().length < 2) {
          toast.error(t("nameRequired"));
          return;
        }
        const r = await createChannelAction({
          name,
          description,
          is_private: isPrivate,
          member_ids: Array.from(picked),
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        onClose();
        router.push(`${routes.chat}/${r.data.id}` as never);
        router.refresh();
        return;
      }

      // group
      if (name.trim().length < 2) {
        toast.error(t("nameRequired"));
        return;
      }
      if (picked.size === 0) {
        toast.error(t("pickAtLeastOne"));
        return;
      }
      const r = await createGroupAction({
        name,
        description,
        member_ids: Array.from(picked),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onClose();
      router.push(`${routes.chat}/${r.data.id}` as never);
      router.refresh();
    });
  }

  const title =
    mode === "channel"
      ? t("titleChannel")
      : mode === "direct"
        ? t("titleDirect")
        : t("titleGroup");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-[520px] rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-neutral-100 p-5">
          <h3 className="text-[16px] font-semibold text-neutral-800">
            {title}
          </h3>
        </header>

        <div className="flex flex-col gap-4 p-5">
          {mode !== "direct" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("name")}
                </span>
                <input
                  className="input"
                  placeholder={
                    mode === "channel"
                      ? "einsatzplan-anpassungen"
                      : "Team Springer"
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("description")}
                </span>
                <textarea
                  rows={2}
                  className="input min-h-[64px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {mode === "channel" && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-[13px] text-neutral-700">
                    🔒 {t("privateLabel")}
                  </span>
                </label>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
              {mode === "direct" ? t("pickTeammate") : t("members")}
            </span>
            <input
              className="input"
              placeholder={t("filterTeammates")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="max-h-[220px] overflow-y-auto rounded-md border border-neutral-100">
              {filteredTeammates.length === 0 ? (
                <li className="p-3 text-center text-[12px] text-neutral-500">
                  {t("noTeammates")}
                </li>
              ) : (
                filteredTeammates.map((tm) => {
                  const checked = picked.has(tm.id);
                  return (
                    <li key={tm.id}>
                      <label className="flex cursor-pointer items-center gap-3 border-b border-neutral-50 px-3 py-2 last:border-b-0 hover:bg-neutral-50">
                        <input
                          type={mode === "direct" ? "radio" : "checkbox"}
                          checked={checked}
                          onChange={() => togglePick(tm.id)}
                          className="h-4 w-4"
                        />
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700">
                          {initials(tm.full_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-neutral-800">
                            {tm.full_name}
                          </span>
                          {tm.role && (
                            <span className="block truncate text-[10px] text-neutral-500">
                              {tm.role}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
            {mode !== "direct" && (
              <span className="text-[11px] text-neutral-500">
                {t("memberCount", { n: picked.size })}
              </span>
            )}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn btn--ghost border border-neutral-200"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={cn(
              "btn btn--primary",
              pending && "opacity-80",
            )}
          >
            {pending ? "…" : t("create")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function initials(s: string): string {
  return s
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
