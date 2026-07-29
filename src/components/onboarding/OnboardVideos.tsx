"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { routes } from "@/lib/constants/routes";
import { updateTrainingProgressAction } from "@/app/actions/training";
import { unlockSystemAction } from "@/app/actions/onboard-videos";
import type { OnboardingState, OnboardingVideo } from "@/lib/api/onboard-videos";
import { classifyVideoUrl } from "@/lib/utils/video-embed";
import { SignaturePad } from "./SignaturePad";

/**
 * Sequenced video player + sign-off for new field staff.
 *
 * Behaviour:
 *   - Mandatory videos render first, in `position` order. The "next"
 *     button is locked until the current video has been watched (we
 *     use the HTML5 `ended` event as the simplest signal — strict UX,
 *     not strict DRM).
 *   - Completing a mandatory video calls `updateTrainingProgressAction`
 *     with `state: 'complete'`, which writes both the timestamp and
 *     any signature payload required by the module.
 *   - Once the last mandatory video is signed off, the "Unlock system"
 *     CTA appears. Clicking it calls `unlockSystemAction()`, which
 *     re-verifies on the server and flips `employees.system_unlocked_at`.
 *   - After unlock the page navigates to /dashboard.
 *
 * The component intentionally keeps the chrome minimal — sidebar / topbar
 * aren't rendered because the user hasn't earned full app access yet.
 */
export function OnboardVideos({ initial }: { initial: OnboardingState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // `initial` is loaded once by the server component at /onboard/videos
  // and never re-keyed: as soon as the user unlocks the system we
  // `router.replace(routes.dashboard)` and this component unmounts. The
  // "stale derived state" warning from react-doctor is therefore not a
  // real bug here — useState(prop) only stales when the parent re-renders
  // with a new prop, which doesn't happen on this route. We use the lazy
  // initialiser form anyway so the intent is explicit at the call site.
  const [videos, setVideos] = useState<OnboardingVideo[]>(() => initial.videos);
  const [cursor, setCursor] = useState<number>(() => initial.currentIndex);
  const [watchedThisSession, setWatchedThisSession] = useState<Set<string>>(
    () =>
      new Set(
        initial.videos.filter((v) => v.completed_at).map((v) => v.id),
      ),
  );
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null);

  const mandatory = useMemo(() => videos.filter((v) => v.is_mandatory), [videos]);
  const mandatoryDone = mandatory.filter((v) => v.completed_at !== null).length;
  const allMandatoryDone = mandatory.length > 0 && mandatoryDone === mandatory.length;

  const current = videos[cursor];

  // Classify the current module's URL up-front. `direct` → <video src>,
  // `embed` → YouTube/Vimeo/Loom iframe, `invalid` → clear error state
  // instead of a black rectangle that fails silently.
  const classified = current
    ? classifyVideoUrl(current.video_url)
    : { kind: "invalid" as const };

  // For iframe embeds we can't observe `onEnded` cross-origin. Give the
  // user an explicit "I watched it" toggle that flips `watchedThisSession`
  // the same way the <video onEnded> would.
  function markManuallyWatched(id: string) {
    setWatchedThisSession((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  // <video> onError — the src returned an HTTP error or was not a valid
  // media container. We toast a helpful message so the field-staff user
  // knows to flag it, and drop out of the "watched required" gate so
  // they aren't stuck (managers can re-upload afterwards).
  function markUnplayable(id: string) {
    toast.error(
      "Video konnte nicht geladen werden. Bitte an die Geschäftsleitung melden.",
    );
    markManuallyWatched(id);
  }

  function markCompleteThenAdvance(video: OnboardingVideo) {
    start(async () => {
      const r = await updateTrainingProgressAction({
        module_id: video.id,
        state: "complete",
        ...(signatureSvg ? { signature_svg: signatureSvg } : {}),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Mirror the completion locally so the UI updates without a
      // page reload.
      const nowIso = new Date().toISOString();
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, completed_at: nowIso } : v,
        ),
      );
      setSignatureSvg(null);
      // Advance to the next incomplete mandatory module, or stop on
      // the last entry.
      const nextIdx = videos.findIndex(
        (v, i) => i > cursor && v.is_mandatory && !v.completed_at,
      );
      if (nextIdx >= 0) setCursor(nextIdx);
      toast.success(`„${video.title}" abgeschlossen.`);
    });
  }

  function unlock() {
    start(async () => {
      const r = await unlockSystemAction();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("System freigeschaltet. Willkommen im Team!");
      router.replace(routes.dashboard);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-tertiary-200">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5 p-6 lg:grid-cols-[280px_1fr]">
        {/* --- Side rail: sequence list --- */}
        <aside className="rounded-lg border border-neutral-200 bg-white p-4">
          <header className="mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-warning-700">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
              Pflicht-Einarbeitung
            </span>
            <h1 className="mt-2 text-[18px] font-bold text-secondary-500">
              Schulungsvideos
            </h1>
            <p className="mt-1 text-[12px] text-neutral-500">
              {mandatoryDone} / {mandatory.length} Pflichtmodule abgeschlossen
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-primary-500 transition-[width]"
                style={{
                  width:
                    mandatory.length === 0
                      ? "0%"
                      : `${(mandatoryDone / mandatory.length) * 100}%`,
                }}
              />
            </div>
          </header>
          <ol className="space-y-1">
            {videos.map((v, i) => {
              const isActive = i === cursor;
              const done = v.completed_at !== null;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    // Don't let the user skip ahead of the first
                    // incomplete mandatory video — the sequence has to
                    // be walked in order.
                    disabled={
                      v.is_mandatory &&
                      !done &&
                      videos
                        .slice(0, i)
                        .some((x) => x.is_mandatory && !x.completed_at)
                    }
                    onClick={() => setCursor(i)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isActive
                        ? "bg-primary-50 ring-1 ring-primary-300"
                        : "hover:bg-neutral-50"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                        done
                          ? "bg-success-500 text-white"
                          : v.is_mandatory
                            ? "bg-warning-100 text-warning-700"
                            : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className="flex-1 truncate font-medium text-neutral-800">
                      {v.title}
                    </span>
                    {v.is_mandatory && !done && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-warning-700">
                        Pflicht
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* --- Main: player + sign-off --- */}
        <main className="rounded-lg border border-neutral-200 bg-white p-6">
          {!current ? (
            <p className="text-[14px] text-neutral-500">
              Keine Schulungsmodule hinterlegt. Bitte den Administrator kontaktieren.
            </p>
          ) : (
            <>
              <header className="mb-4">
                <h2 className="text-[20px] font-bold text-secondary-500">
                  {current.title}
                </h2>
                {current.description && (
                  <p className="mt-1 max-w-prose text-[13px] text-neutral-600">
                    {current.description}
                  </p>
                )}
              </header>

              <div className="aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
                {classified.kind === "direct" && (
                  <video
                    key={current.id}
                    src={classified.src}
                    controls
                    controlsList="nodownload"
                    preload="metadata"
                    onEnded={() => markManuallyWatched(current.id)}
                    onError={() => markUnplayable(current.id)}
                    className="h-full w-full"
                  />
                )}
                {classified.kind === "embed" && (
                  <iframe
                    key={current.id}
                    src={classified.src}
                    title={current.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                )}
                {classified.kind === "invalid" && (
                  <div className="grid h-full w-full place-items-center px-6 text-center text-[13px] text-neutral-400">
                    {current.video_url
                      ? "Video-URL ist ungültig oder nicht abspielbar. Bitte die Geschäftsleitung informieren."
                      : "Kein Video hinterlegt – bitte Inhalt prüfen."}
                  </div>
                )}
              </div>

              {/* Iframe embeds can't fire `onEnded` cross-origin, so we
                  give the user an explicit "I watched it" checkbox.
                  Direct <video> renders don't need this — the onEnded
                  event handles it automatically. */}
              {classified.kind === "embed" && !current.completed_at && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-neutral-700">
                  <input
                    type="checkbox"
                    checked={watchedThisSession.has(current.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        markManuallyWatched(current.id);
                      } else {
                        setWatchedThisSession((prev) => {
                          const next = new Set(prev);
                          next.delete(current.id);
                          return next;
                        });
                      }
                    }}
                    className="h-4 w-4 accent-primary-500"
                  />
                  Ich habe das Video vollständig angesehen.
                </label>
              )}

              {/* Invalid URL — let the user complete the module anyway
                  so they aren't blocked from unlocking the system. */}
              {classified.kind === "invalid" &&
                current.video_url &&
                !current.completed_at &&
                !watchedThisSession.has(current.id) && (
                  <button
                    type="button"
                    onClick={() => markManuallyWatched(current.id)}
                    className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Video ist bei mir kaputt — trotzdem fortfahren
                  </button>
                )}

              {/* Signature pad — shown after the video is watched for mandatory modules */}
              {current.is_mandatory &&
                !current.completed_at &&
                watchedThisSession.has(current.id) && (
                  <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <p className="mb-2 text-[12px] font-medium text-neutral-700">
                      Bitte unterschreiben Sie, um den Abschluss zu bestätigen:
                    </p>
                    <SignaturePad onChange={setSignatureSvg} />
                  </div>
                )}

              <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-neutral-500">
                  {current.completed_at
                    ? "Bereits abgeschlossen."
                    : watchedThisSession.has(current.id)
                      ? current.is_mandatory && !signatureSvg
                        ? "Bitte unterschreiben Sie oben, um fortzufahren."
                        : "Video angesehen. Bestätige unten den Abschluss."
                      : "Bitte das Video vollständig ansehen, bevor du fortfährst."}
                </p>
                <div className="flex items-center gap-2">
                  {!current.completed_at && (
                    <button
                      type="button"
                      onClick={() => markCompleteThenAdvance(current)}
                      disabled={
                        pending ||
                        (current.video_url
                          ? !watchedThisSession.has(current.id)
                          : false) ||
                        (current.is_mandatory && !signatureSvg)
                      }
                      className="rounded-md bg-secondary-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-secondary-600 disabled:opacity-50"
                    >
                      {pending ? "Speichere…" : "Abschluss bestätigen"}
                    </button>
                  )}
                  {allMandatoryDone && (
                    <button
                      type="button"
                      onClick={unlock}
                      disabled={pending}
                      className="rounded-md bg-primary-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-primary-600 disabled:opacity-50"
                    >
                      {pending ? "Schalte frei…" : "System freischalten →"}
                    </button>
                  )}
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
