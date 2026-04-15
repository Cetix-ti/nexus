// ============================================================================
// Next.js instrumentation hook — exécuté UNE FOIS au démarrage du serveur.
// Utilisé pour démarrer les jobs de synchronisation en arrière-plan
// (email→ticket, monitoring, veeam).
// Docs : https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// ============================================================================

export async function register() {
  // Limite au runtime Node.js (pas Edge — les jobs font des I/O Prisma + Graph).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackgroundJobs } = await import("@/lib/scheduler/background-jobs");
  startBackgroundJobs();
}
