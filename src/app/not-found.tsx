import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center px-6">
        <p className="text-7xl font-bold text-slate-200">404</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-md">
          La page que vous recherchez n&apos;existe pas ou a été déplacée.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Tableau de bord
          </Link>
          <Link
            href="/tickets"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Tickets
          </Link>
        </div>
      </div>
    </div>
  );
}
