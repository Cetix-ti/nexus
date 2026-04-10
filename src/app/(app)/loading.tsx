import { PageLoader } from "@/components/ui/page-loader";

/**
 * Affiché automatiquement par Next.js pendant les transitions de navigation
 * vers n'importe quelle page sous (app)/.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-slate-200/60" />
        <div className="space-y-2">
          <div className="h-5 w-48 rounded bg-slate-200/60" />
          <div className="h-3 w-32 rounded bg-slate-200/60" />
        </div>
      </div>
      <PageLoader variant="table" rows={6} />
    </div>
  );
}
