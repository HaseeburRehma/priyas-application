"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { env } from "@/lib/constants/env";
import {
  getCurrentSubscription,
  getPushPermission,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";
import {
  registerPushSubscriptionAction,
  unregisterPushSubscriptionAction,
} from "@/app/actions/push";

type State =
  | "loading"
  | "unsupported"
  | "denied"
  | "off"
  | "on"
  | "missing-vapid";

export function PushToggleCard() {
  const t = useTranslations("settings.push");
  const [state, setState] = useState<State>("loading");
  const [pending, start] = useTransition();
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!isPushSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        if (!cancelled) setState("missing-vapid");
        return;
      }
      const perm = getPushPermission();
      if (perm === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const sub = await getCurrentSubscription();
      if (cancelled) return;
      if (sub) {
        setEndpoint(sub.endpoint);
        setState("on");
      } else {
        setState("off");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    start(async () => {
      const sub = await subscribeToPush(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
      if (!sub) {
        if (getPushPermission() === "denied") setState("denied");
        toast.error(t("permissionDenied"));
        return;
      }
      const json = sub.toJSON();
      const r = await registerPushSubscriptionAction({
        endpoint: json.endpoint!,
        keys: {
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
        user_agent: navigator.userAgent,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setEndpoint(json.endpoint!);
      setState("on");
      toast.success(t("enabledToast"));
    });
  }

  function disable() {
    start(async () => {
      const ep = endpoint;
      await unsubscribeFromPush();
      if (ep) {
        await unregisterPushSubscriptionAction(ep);
      }
      setEndpoint(null);
      setState("off");
      toast.success(t("disabledToast"));
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h2 className="text-[17px] font-bold text-secondary-500">
          {t("title")}
        </h2>
        <p className="mt-1 text-[12px] text-neutral-500">{t("subtitle")}</p>
      </header>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-neutral-100 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-neutral-800">
                {t("deviceTitle")}
              </span>
              <Badge state={state} t={t} />
            </div>
            <p className="mt-1 max-w-[480px] text-[12px] leading-[1.5] text-neutral-500">
              {bodyFor(state, t)}
            </p>
          </div>
          {state === "on" ? (
            <button
              type="button"
              disabled={pending}
              onClick={disable}
              className="btn btn--ghost border border-error-500 text-error-700 hover:bg-error-50"
            >
              {t("disable")}
            </button>
          ) : state === "off" ? (
            <button
              type="button"
              disabled={pending}
              onClick={enable}
              className="btn btn--primary"
            >
              {t("enable")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Badge({
  state,
  t,
}: {
  state: State;
  t: (key: string) => string;
}) {
  const map: Record<State, { cls: string; key: string }> = {
    loading: { cls: "bg-neutral-100 text-neutral-600", key: "stateLoading" },
    unsupported: { cls: "bg-neutral-100 text-neutral-600", key: "stateUnsupported" },
    denied: { cls: "bg-error-50 text-error-700", key: "stateDenied" },
    "missing-vapid": {
      cls: "bg-warning-50 text-warning-700",
      key: "stateMissingVapid",
    },
    off: { cls: "bg-neutral-100 text-neutral-600", key: "stateOff" },
    on: { cls: "bg-success-50 text-success-700", key: "stateOn" },
  };
  const m = map[state];
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        m.cls,
      )}
    >
      {t(m.key)}
    </span>
  );
}

function bodyFor(state: State, t: (k: string) => string): string {
  switch (state) {
    case "loading":
      return t("bodyLoading");
    case "unsupported":
      return t("bodyUnsupported");
    case "denied":
      return t("bodyDenied");
    case "missing-vapid":
      return t("bodyMissingVapid");
    case "on":
      return t("bodyOn");
    default:
      return t("bodyOff");
  }
}
