import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  source: string; // e.g. "03-clients-list.html"
};

/**
 * Visual stand-in for routes whose real implementation lands in a future
 * phase. Keeps every sidebar link working so QA can navigate the shell.
 */
export function PlaceholderPage({ title, subtitle, source }: Props) {
  return (
    <>
      <div className="mb-7">
        <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
          {title}
        </h1>
        {subtitle && <p className="text-[13px] text-neutral-500">{subtitle}</p>}
      </div>

      <section className="card grid place-items-center gap-3 px-5 py-16 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary-600">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 4v16M4 12h16" />
          </svg>
        </span>
        <h2 className="text-[16px] font-semibold text-secondary-500">
          Wird in der nächsten Phase implementiert
        </h2>
        <p className="max-w-[480px] text-[13px] text-neutral-500">
          Diese Seite wird aus <code className="font-mono">{source}</code>{" "}
          umgesetzt. Schema, Routing und Layout-Shell stehen bereits — bitte
          gib das Foundation-Review frei, dann baue ich diese Seite vollständig
          aus.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 text-[13px] font-medium text-primary-600 hover:underline"
        >
          ← Zur Übersicht
        </Link>
      </section>
    </>
  );
}
