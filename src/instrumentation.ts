// ============================================================================
// Next.js instrumentation hook — exécuté UNE FOIS au démarrage du serveur.
// Utilisé pour démarrer les jobs de synchronisation en arrière-plan
// (email→ticket, monitoring, veeam).
// Docs : https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// ============================================================================

export async function register() {
  // Limite au runtime Node.js (pas Edge — les jobs font des I/O Prisma + Graph).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackgroundJobs, stopBackgroundJobs } = await import(
    "@/lib/scheduler/background-jobs"
  );
  startBackgroundJobs();

  // Graceful shutdown — systemd envoie SIGTERM avant de tuer le process.
  // Sans handler, les intervals du scheduler empêchent le process de quitter
  // et systemd attend TimeoutStopSec (90s par défaut) → SIGKILL. En clearant
  // les timers on sort proprement en quelques secondes.
  const shutdown = (signal: string) => () => {
    console.log(`[nexus] ${signal} reçu — shutdown graceful`);
    stopBackgroundJobs();
    // Laisse 3s aux ticks en cours pour finir leurs writes DB avant de sortir.
    setTimeout(() => process.exit(0), 3_000);
  };
  process.once("SIGTERM", shutdown("SIGTERM"));
  process.once("SIGINT", shutdown("SIGINT"));
}
