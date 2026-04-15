// ============================================================================
// BACKGROUND JOBS — scheduler intégré au process Next.js
//
// Tourne en permanence tant que le serveur est up. Aucune config externe
// (cron, systemd timer) n'est requise : `instrumentation.ts` démarre ça
// automatiquement au boot du server.
//
// Concurrence : chaque job est gardé par un flag booléen — si un sync
// prend plus longtemps que son intervalle, le tick suivant saute plutôt
// que de déclencher deux exécutions en parallèle.
//
// Intervalles par défaut :
//   - Email → ticket      : 60 s (quasi-temps réel pour les tickets client)
//   - Monitoring alerts   : 120 s (email monitoring Zabbix/Atera)
//   - Veeam backups       : 300 s (plus lent — pas critique au seconde près)
//
// Toutes les valeurs peuvent être écrasées par env :
//   EMAIL_SYNC_INTERVAL_MS, MONITORING_SYNC_INTERVAL_MS, VEEAM_SYNC_INTERVAL_MS
//   DISABLE_BACKGROUND_JOBS=1 pour tout désactiver (utile en dev/test).
// ============================================================================

type Job = {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
  isRunning: boolean;
  lastRun: Date | null;
  lastError: string | null;
  consecutiveErrors: number;
};

const jobs = new Map<string, Job>();
let started = false;

function scheduleJob(job: Job) {
  jobs.set(job.name, job);

  const tick = async () => {
    if (job.isRunning) {
      // Job précédent pas fini : on saute ce tick.
      return;
    }
    job.isRunning = true;
    try {
      await job.run();
      job.lastRun = new Date();
      job.lastError = null;
      job.consecutiveErrors = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.lastError = msg;
      job.consecutiveErrors++;
      // Log mais ne tue pas le scheduler.
      console.error(
        `[background-jobs] ${job.name} failed (${job.consecutiveErrors}x): ${msg}`,
      );
      // Back-off progressif : si >5 échecs d'affilée, on espace temporairement.
      if (job.consecutiveErrors >= 5) {
        console.warn(
          `[background-jobs] ${job.name} : 5+ échecs consécutifs — vérifiez la config (credentials, mailbox, etc.)`,
        );
      }
    } finally {
      job.isRunning = false;
    }
  };

  // Premier run après un court délai (laisse le serveur se stabiliser).
  setTimeout(() => {
    void tick();
    // Puis à chaque intervalle.
    setInterval(() => void tick(), job.intervalMs);
  }, 10_000);

  console.log(
    `[background-jobs] scheduled "${job.name}" every ${job.intervalMs / 1000}s`,
  );
}

export function startBackgroundJobs() {
  if (started) return;
  started = true;

  if (process.env.DISABLE_BACKGROUND_JOBS === "1") {
    console.log("[background-jobs] désactivés (DISABLE_BACKGROUND_JOBS=1)");
    return;
  }
  // Ne démarre pas pendant les builds / phases build-time de Next.js.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  scheduleJob({
    name: "email-to-ticket",
    intervalMs: Number(process.env.EMAIL_SYNC_INTERVAL_MS) || 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { syncEmailsToTickets } = await import("@/lib/email-to-ticket/service");
      const result = await syncEmailsToTickets();
      if (result.created > 0) {
        console.log(
          `[email-to-ticket] +${result.created} ticket(s) depuis ${result.fetched} email(s)`,
        );
      }
    },
  });

  scheduleJob({
    name: "monitoring-alerts",
    intervalMs: Number(process.env.MONITORING_SYNC_INTERVAL_MS) || 120_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { syncMonitoringAlerts } = await import("@/lib/monitoring/email-sync");
      const result = await syncMonitoringAlerts();
      if (result.created > 0 || result.resolved > 0) {
        console.log(
          `[monitoring] +${result.created} alertes, ${result.resolved} résolutions (${result.fetched} emails vus)`,
        );
      }
    },
  });

  scheduleJob({
    name: "veeam-backups",
    intervalMs: Number(process.env.VEEAM_SYNC_INTERVAL_MS) || 300_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { syncVeeamAlerts } = await import("@/lib/veeam/graph-sync");
      const result = await syncVeeamAlerts(null);
      if (result.newAlerts > 0) {
        console.log(
          `[veeam] +${result.newAlerts} alertes backup (${result.fetched} emails vus)`,
        );
      }
    },
  });

  scheduleJob({
    name: "renewal-notifications",
    // 1 h — les échéances ne bougent pas à la minute. Suffisant pour
    // détecter les franchissements de milestones (30j, 14j, 7j, 1j, jour-J).
    intervalMs: Number(process.env.RENEWAL_NOTIF_INTERVAL_MS) || 3_600_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runRenewalNotifications } = await import("@/lib/calendar/renewal-notifications");
      const result = await runRenewalNotifications();
      if (result.created > 0) {
        console.log(
          `[renewals] +${result.created} notifications créées (${result.checked} renouvellements inspectés)`,
        );
      }
    },
  });
}

/** Pour une endpoint /api/v1/admin/jobs/status qui pourrait être câblée plus tard. */
export function getJobsStatus() {
  return Array.from(jobs.values()).map((j) => ({
    name: j.name,
    intervalMs: j.intervalMs,
    isRunning: j.isRunning,
    lastRun: j.lastRun?.toISOString() ?? null,
    lastError: j.lastError,
    consecutiveErrors: j.consecutiveErrors,
  }));
}
