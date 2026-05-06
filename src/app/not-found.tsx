import Link from "next/link";
import { routes } from "@/lib/constants/routes";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-tertiary-200 px-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-error-50 text-error-700">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <circle cx={12} cy={12} r={10} />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h1 className="mb-1 text-[20px] font-bold text-secondary-500">
          Seite nicht gefunden
        </h1>
        <p className="mb-5 text-[13px] text-neutral-500">
          Die gesuchte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link href={routes.dashboard} className="btn btn--primary">
          Zur Übersicht
        </Link>
      </div>
    </main>
  );
}
