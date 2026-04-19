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

// Dernier motif d'erreur du sync email. Sert à dédupliquer les logs
// quand la même erreur se répète à chaque tick (30s) — sinon 4h de
// "AZURE_* requis" pollueraient les journaux.
let _emailSyncLastErrorKey: string | null = null;

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
    // 30s par défaut — proche temps réel pour l'ingestion des tickets
    // clients entrants sur billets@cetix.ca. Override via env si besoin.
    intervalMs: Number(process.env.EMAIL_SYNC_INTERVAL_MS) || 30_000,
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
      // Rend les erreurs VISIBLES. Avant : result.errors pouvait
      // contenir "AZURE_* requis" depuis 4h sans aucun log → le user
      // voyait « les tickets n'arrivent plus » sans indice côté ops.
      // Maintenant, dès qu'une erreur apparaît, elle est loguée en
      // warning. Si la même erreur se répète à chaque tick, on évite
      // le spam en ne loguant qu'une fois jusqu'au prochain succès.
      if (result.errors && result.errors.length > 0) {
        const key = result.errors.join("||");
        if (!_emailSyncLastErrorKey || _emailSyncLastErrorKey !== key) {
          console.warn(
            `[email-to-ticket] erreur(s) : ${result.errors.slice(0, 3).join(" | ")}`,
          );
          _emailSyncLastErrorKey = key;
        }
      } else if (_emailSyncLastErrorKey) {
        console.log("[email-to-ticket] erreurs précédentes résolues");
        _emailSyncLastErrorKey = null;
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

  // Note : il n'y a PAS de job pull Bitdefender. L'API GravityZone
  // n'expose pas getEvents — elle fonctionne en push (webhook).
  // Voir /api/v1/integrations/bitdefender/webhook + le script
  // scripts/bitdefender-register-webhook.ts pour le setup.

  scheduleJob({
    name: "security-wazuh-email",
    intervalMs: Number(process.env.SECURITY_WAZUH_INTERVAL_MS) || 120_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { syncWazuhEmails } = await import("@/lib/security-center/jobs");
      const res = await syncWazuhEmails();
      if (res.ingested > 0) {
        console.log(`[security/wazuh-email] +${res.ingested} nouvelles alertes`);
      }
    },
  });

  // Pull JSON direct depuis l'API Wazuh — recommandé vs email. Les deux
  // jobs tournent en parallèle : dès que l'admin active l'API dans les
  // paramètres, le décodeur API prend le relais (dédup via _id, donc
  // pas de double-ingestion).
  scheduleJob({
    name: "security-wazuh-api",
    intervalMs: Number(process.env.SECURITY_WAZUH_API_INTERVAL_MS) || 120_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { syncWazuhApi } = await import("@/lib/security-center/jobs");
      const res = await syncWazuhApi();
      if (res.ingested > 0) {
        console.log(`[security/wazuh-api] +${res.ingested} nouvelles alertes`);
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

  scheduleJob({
    name: "location-sync",
    // 2 min — pull du calendrier partagé "Localisation" sur billets@cetix.ca.
    // Le push Nexus → Outlook est synchrone via les endpoints, donc pas
    // besoin d'un tick rapide ici.
    intervalMs: Number(process.env.LOCATION_SYNC_INTERVAL_MS) || 120_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { pullOutlookLocations } = await import("@/lib/calendar/location-sync");
      const result = await pullOutlookLocations();
      if (result.created > 0 || result.updated > 0 || result.deleted > 0 || result.undecoded > 0) {
        console.log(
          `[location-sync] +${result.created} / ~${result.updated} / -${result.deleted} / ?${result.undecoded} (${result.fetched} Outlook events vus)`,
        );
      }
      if (result.errors.length > 0) {
        console.warn(`[location-sync] erreurs:`, result.errors.slice(0, 5));
      }
    },
  });

  // Auto-intelligence IA : rafraîchit l'analyse de risque + extrait les
  // faits pour chaque org active périodiquement. Mécanisme qui rend Nexus
  // "plus intelligent avec le temps" sans intervention manuelle. Max 3
  // orgs par tick (budget IA contrôlé), staleness 7 jours.
  scheduleJob({
    name: "ai-auto-intelligence",
    intervalMs: Number(process.env.AI_AUTO_INTEL_INTERVAL_MS) || 21_600_000, // 6h
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runAutoIntelligence } = await import(
        "@/lib/ai/jobs/auto-intelligence"
      );
      const res = await runAutoIntelligence();
      if (res.refreshed > 0 || res.factsAdded > 0) {
        console.log(
          `[ai-auto-intelligence] ${res.refreshed} org(s) rafraîchies, ${res.factsAdded} fait(s) extraits (${res.skipped}/${res.checked} skippées)`,
        );
      }
    },
  });

  scheduleJob({
    name: "meeting-reminders",
    // 5 min — fenêtre de 30 min, on doit ticker assez souvent pour ne pas
    // rater le passage. Idempotent côté job (1 notif par meeting+user).
    intervalMs: Number(process.env.MEETING_REMINDER_INTERVAL_MS) || 300_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runMeetingReminders } = await import("@/lib/calendar/meeting-reminders");
      const result = await runMeetingReminders();
      if (result.created > 0) {
        console.log(
          `[meeting-reminders] +${result.created} rappels (${result.checked} rencontres dans la fenêtre)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // AI Audit autonome — un juge IA (gpt-4o-mini) audite les décisions du
  // modèle local (gemma3) et ALIMENTE un apprentissage auto-apprenant.
  // Toutes les 3h, échantillonne 15 invocations récentes, les fait
  // auditer, et applique automatiquement les suggestions récurrentes
  // (mots trop génériques, mappings catégorie forcés, etc.) dans
  // AiPattern. Les features lisent ces patterns à chaque appel.
  //
  // 100% autonome : aucun admin n'a à valider quoi que ce soit.
  // Les résultats restent consultables dans Paramètres > Intelligence IA.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "ai-audit",
    intervalMs: Number(process.env.AI_AUDIT_INTERVAL_MS) || 3 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runAiAudit } = await import("@/lib/ai/jobs/ai-audit");
      const res = await runAiAudit();
      if (res.audited > 0) {
        console.log(
          `[ai-audit] ${res.audited} audit(s) : ${res.agreed} OK, ${res.disagreed} ❌, ${res.partial} ±, ${res.autoApplied} patterns auto-appliqués`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // TICKET EMBEDDINGS — backfill continu des vecteurs sémantiques.
  // Lit 50 tickets sans embedding toutes les 5 min. Un nouveau ticket
  // obtient son embedding dans la fenêtre 0-5 min après sa création.
  // Le job traite aussi les tickets édités (embedding périmé vs updatedAt).
  // -----------------------------------------------------------------------
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    scheduleJob({
      name: "ticket-embeddings",
      intervalMs: Number(process.env.EMBEDDING_INTERVAL_MS) || 5 * 60_000,
      isRunning: false,
      lastRun: null,
      lastError: null,
      consecutiveErrors: 0,
      run: async () => {
        const { backfillEmbeddings } = await import("@/lib/ai/embeddings");
        const res = await backfillEmbeddings(
          Number(process.env.EMBEDDING_BATCH || 50),
        );
        if (res.embedded > 0 || res.failed > 0) {
          console.log(
            `[embeddings] +${res.embedded} tickets indexés, ${res.failed} échecs (${res.scanned} scannés)`,
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // TRIAGE FEEDBACK LEARNER — agrège les thumbs-down sur priority / type /
  // duplicate en pénalités token → value. Le triage downgrade automatiquement
  // la confidence / retire les doublons exclus. Interval 6h.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "triage-feedback-learner",
    intervalMs:
      Number(process.env.TRIAGE_FEEDBACK_INTERVAL_MS) ||
      6 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runTriageFeedbackLearner } = await import(
        "@/lib/ai/jobs/triage-feedback-learner"
      );
      const res = await runTriageFeedbackLearner();
      if (res.penaltiesWritten > 0 || res.penaltiesReleased > 0) {
        console.log(
          `[triage-feedback] ${res.feedbacksAnalyzed} feedbacks analysés, ${res.penaltiesWritten} pénalités écrites, ${res.penaltiesReleased} libérées`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // CATEGORY FEEDBACK LEARNER — transforme les thumbs-down sur les
  // suggestions de catégorie (triage IA) en pénalités token → catégorie.
  // Le triage downgrade automatiquement la confidence quand les tokens
  // du ticket matchent une catégorie déjà signalée comme fausse.
  // Interval 6h.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "category-feedback-learner",
    intervalMs:
      Number(process.env.CATEGORY_FEEDBACK_INTERVAL_MS) ||
      6 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { learnFromCategoryFeedback } = await import(
        "@/lib/ai/jobs/category-feedback-learner"
      );
      const res = await learnFromCategoryFeedback();
      if (res.avoidancesWritten > 0 || res.avoidancesReleased > 0) {
        console.log(
          `[category-feedback] ${res.feedbacksAnalyzed} feedbacks analysés, ${res.avoidancesWritten} avoidances écrites, ${res.avoidancesReleased} libérées`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // SIMILAR FEEDBACK LEARNER — transforme les thumbs-down (feedback
  // explicite du widget tickets similaires) en pénalités de tokens. Un
  // mot partagé entre plusieurs "bad matches" est progressivement
  // neutralisé dans le scoring. Interval 6h.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "similar-feedback-learner",
    intervalMs:
      Number(process.env.SIMILAR_FEEDBACK_INTERVAL_MS) ||
      6 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { learnFromSimilarFeedback } = await import(
        "@/lib/ai/jobs/similar-feedback-learner"
      );
      const res = await learnFromSimilarFeedback();
      if (res.tokensPenalized > 0 || res.tokensReleased > 0) {
        console.log(
          `[similar-feedback] ${res.feedbacksAnalyzed} feedbacks analysés, ${res.tokensPenalized} tokens pénalisés, ${res.tokensReleased} libérés`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // CLICK FEEDBACK LEARNING — analyse les clics sur le widget "Tickets
  // similaires" et distille les tokens prédictifs de pertinence en
  // boosts applicables au scoring (AiPattern scope="learned:similar").
  // Le feedback boucle en continu : plus les techs cliquent, plus le
  // ranking s'améliore.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "click-feedback-learning",
    intervalMs:
      Number(process.env.CLICK_FEEDBACK_INTERVAL_MS) || 60 * 60_000, // 1h
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { analyzeClickFeedback } = await import(
        "@/lib/ai/jobs/click-ranking"
      );
      const res = await analyzeClickFeedback();
      if (res.tokensBoosted > 0) {
        console.log(
          `[click-feedback] ${res.clicks} clics analysés → ${res.tokensBoosted} tokens boostés ; CTRs: ${JSON.stringify(res.bucketCTRs)}`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // RECURRING TICKETS — détecte les tickets qui se répètent dans le temps
  // chez un même client via clustering sémantique des embeddings. Signale
  // les root-cause manquantes. Pattern stocké dans AiPattern
  // (scope="recurring:<orgId>").
  // -----------------------------------------------------------------------
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    scheduleJob({
      name: "recurring-tickets-detector",
      intervalMs:
        Number(process.env.RECURRING_INTERVAL_MS) || 12 * 60 * 60_000, // 12h
      isRunning: false,
      lastRun: null,
      lastError: null,
      consecutiveErrors: 0,
      run: async () => {
        const { detectRecurringTickets } = await import(
          "@/lib/ai/jobs/recurring-detector"
        );
        const res = await detectRecurringTickets();
        if (res.patterns > 0) {
          console.log(
            `[recurring] ${res.patterns} pattern(s) récurrent(s) détecté(s) sur ${res.orgs} orgs (${res.skipped} patterns stales)`,
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // CLIENT VOCABULARY — extrait le jargon technique propre à chaque client
  // (noms serveurs internes, apps custom, acronymes) et l'ajoute à
  // AiMemory comme facts "vocabulary" auto-validés. Enrichit le contexte
  // de toutes les features IA qui utilisent les faits client.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "client-vocabulary-extractor",
    intervalMs: Number(process.env.VOCAB_INTERVAL_MS) || 12 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { extractClientVocabularies } = await import(
        "@/lib/ai/jobs/client-vocabulary"
      );
      const res = await extractClientVocabularies();
      if (res.factsWritten > 0 || res.tokensAdded > 0) {
        console.log(
          `[vocab] ${res.orgs} orgs scannées → ${res.tokensAdded} tokens qualifiés, ${res.factsWritten} nouveaux facts AiMemory`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // VOLUME ANOMALY — détecte les spikes de volume ticket (possibles
  // incidents majeurs) et ouvre automatiquement un ticket interne Cetix
  // pour que les techs enquêtent. Baseline = 4 semaines précédentes,
  // même tranche horaire. Seuil : z ≥ 3.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "volume-anomaly",
    intervalMs: Number(process.env.VOLUME_ANOMALY_INTERVAL_MS) || 15 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectVolumeAnomalies } = await import(
        "@/lib/ai/jobs/volume-anomaly"
      );
      const res = await detectVolumeAnomalies();
      if (res.incidentsCreated > 0) {
        console.log(
          `[volume-anomaly] ${res.incidentsCreated} incident(s) créé(s) sur ${res.flagged} anomalie(s) détectée(s) (${res.checked} couples org/cat scannés)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // CATEGORY CENTROIDS — recalcul des centroids vectoriels par catégorie.
  // Pour chaque catégorie avec ≥ N tickets résolus embeddés, calcule la
  // moyenne des embeddings → stockée dans AiPattern. Utilisée par triage
  // pour ancrer les suggestions de catégorie dans les données réelles
  // (robuste aux hallucinations LLM).
  // -----------------------------------------------------------------------
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    scheduleJob({
      name: "category-centroids",
      intervalMs:
        Number(process.env.CENTROID_INTERVAL_MS) || 6 * 60 * 60_000,
      isRunning: false,
      lastRun: null,
      lastError: null,
      consecutiveErrors: 0,
      run: async () => {
        const { rebuildCategoryCentroids } = await import(
          "@/lib/ai/jobs/category-centroids"
        );
        const res = await rebuildCategoryCentroids();
        if (res.centroids > 0) {
          console.log(
            `[centroids] ${res.centroids}/${res.categories} centroids rebuilt (${res.skipped} skipped - trop peu de tickets)`,
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // AI LEARNING LOOPS — 3 boucles d'auto-apprentissage complémentaires :
  //   1. Auto-validation des faits AiMemory par consensus (≥3 sources)
  //   2. Apprentissage des patterns d'édition (preferred/avoided phrasings)
  //   3. Calibration des escalades de priorité (tokens → signal escalade)
  // Toutes écrivent dans AiPattern (scope="learned:<feature>") qui est lu
  // par les features concernées à chaque invocation.
  //
  // Interval 6h — plus long que l'audit (3h) car les patterns émergent
  // plus lentement (besoin de plusieurs jours d'historique).
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "ai-learning-loops",
    intervalMs: Number(process.env.AI_LEARNING_INTERVAL_MS) || 6 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runLearningLoops } = await import("@/lib/ai/jobs/learning-loops");
      const res = await runLearningLoops();
      const total = res.factsAutoValidated + res.responseEditsLearned + res.priorityCalibrations;
      if (total > 0) {
        console.log(
          `[ai-learning] ${res.factsAutoValidated} fait(s) auto-validé(s), ${res.responseEditsLearned} pattern(s) d'édition, ${res.priorityCalibrations} calibration(s) priorité`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // NOTIFICATION PROFILE — apprend le pattern d'engagement réel de chaque
  // user (read rate par créneau horaire et par type). Expose des helpers
  // `shouldBatchForUser` et `shouldSuppressType` consommables par le
  // service de notifications pour un batching intelligent optionnel.
  // Interval 12h — profils relativement stables.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "notification-profile",
    intervalMs:
      Number(process.env.NOTIFICATION_PROFILE_INTERVAL_MS) ||
      12 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { rebuildNotificationProfiles } = await import(
        "@/lib/ai/jobs/notification-profile"
      );
      const res = await rebuildNotificationProfiles();
      if (res.profilesWritten > 0) {
        console.log(
          `[notification-profile] ${res.profilesWritten}/${res.users} profils recalculés (${res.skipped} skippés)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // REQUESTER ANOMALY — apprend le rythme habituel de chaque demandeur et
  // signale les comportements inhabituels (spikes, horaires hors normes,
  // catégories jamais utilisées). Signal utile pour détecter soit un
  // compte compromis, soit un incident réel qui affecte un utilisateur.
  // Deux jobs : baseline quotidien (lourd) + détection fréquente (léger).
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "requester-anomaly-detect",
    intervalMs:
      Number(process.env.REQUESTER_ANOMALY_INTERVAL_MS) || 30 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectRequesterAnomalies } = await import(
        "@/lib/ai/jobs/requester-anomaly"
      );
      const res = await detectRequesterAnomalies();
      if (res.anomaliesDetected > 0) {
        console.log(
          `[requester-anomaly] ${res.anomaliesDetected} anomalie(s) sur ${res.contactsChecked} contacts, ${res.highSeverity} sévérité HIGH`,
        );
      }
    },
  });

  scheduleJob({
    name: "requester-baseline-rebuild",
    intervalMs:
      Number(process.env.REQUESTER_BASELINE_INTERVAL_MS) ||
      24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { rebuildRequesterBaselines } = await import(
        "@/lib/ai/jobs/requester-anomaly"
      );
      const res = await rebuildRequesterBaselines();
      if (res.baselinesWritten > 0) {
        console.log(
          `[requester-baseline] ${res.baselinesWritten}/${res.contacts} baselines recalculées (${res.skipped} skippés)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // THREAD CONSOLIDATOR — résume les longs fils (≥ 8 commentaires) en
  // 4 sections (situation, décisions, essais, questions ouvertes). Permet
  // à un tech qui reprend un ticket de saisir l'état en 15 secondes.
  // Cache-friendly : régénère uniquement quand le thread grossit.
  // Interval 30 min.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "thread-consolidator",
    intervalMs:
      Number(process.env.THREAD_CONSOLIDATOR_INTERVAL_MS) || 30 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { consolidateLongThreads } = await import(
        "@/lib/ai/jobs/thread-consolidator"
      );
      const res = await consolidateLongThreads();
      if (res.recapsWritten > 0 || res.failed > 0) {
        console.log(
          `[thread-consolidator] ${res.recapsWritten}/${res.ticketsScanned} récaps écrits (${res.skippedCached} cachés, ${res.failed} échecs)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // MAINTENANCE SUGGESTER — propose des interventions préventives à partir
  // des patterns récurrents + actifs vieillissants + assets "hotspots".
  // Génère via LLM une suggestion structurée (title, rationale, benefit,
  // effort, impact). Status open → accepté ou rejeté par un admin.
  // Interval 24h — signaux lents, coûteux en LLM.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "maintenance-suggester",
    intervalMs:
      Number(process.env.MAINTENANCE_INTERVAL_MS) || 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runMaintenanceSuggester } = await import(
        "@/lib/ai/jobs/maintenance-suggester"
      );
      const res = await runMaintenanceSuggester();
      if (res.suggestionsWritten > 0) {
        console.log(
          `[maintenance] ${res.suggestionsWritten} suggestion(s) écrite(s) sur ${res.signalsEvaluated} signal(s), ${res.skipped} skippés`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // CROSS-SOURCE DEDUP — détecte les tickets qui ne sont que des reflets
  // différents du MÊME incident (Zabbix + Wazuh + email user en parallèle).
  // Graphe d'affinité (embeddings, hostnames, IPs, requester, time) +
  // union-find → clusters groupés dans AiPattern(dedup:cluster).
  // Interval 5 min — doit capter rapidement après création des tickets.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "cross-source-dedup",
    intervalMs: Number(process.env.DEDUP_INTERVAL_MS) || 5 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectCrossSourceDuplicates } = await import(
        "@/lib/ai/jobs/cross-source-dedup"
      );
      const res = await detectCrossSourceDuplicates();
      if (res.clustersWritten > 0) {
        console.log(
          `[dedup] ${res.clustersDetected} cluster(s) détectés sur ${res.ticketsScanned} tickets (${res.pairsEvaluated} paires évaluées), ${res.clustersWritten} écrits`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // TAXONOMY DEDUP — détecte les paires de catégories dont les centroids
  // sont très similaires (cosine ≥ 0.92). Un admin peut ensuite choisir
  // de fusionner la plus petite dans la plus grande. Interval 7j.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "taxonomy-dedup",
    intervalMs:
      Number(process.env.TAXONOMY_DEDUP_INTERVAL_MS) ||
      7 * 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectTaxonomyDuplicates } = await import(
        "@/lib/ai/jobs/taxonomy-dedup"
      );
      const res = await detectTaxonomyDuplicates();
      if (res.duplicatesDetected > 0) {
        console.log(
          `[taxonomy-dedup] ${res.duplicatesDetected} paires quasi-dupliquées détectées (${res.pairsEvaluated} paires évaluées sur ${res.centroidsScanned} centroids)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // IMPLICIT SLA LEARNER — pour chaque org, apprend les médianes/p75/p90
  // first response + résolution sur 180j. Fournit un baseline même pour
  // les clients sans SLAPolicy explicite. Consommé par SLA drift predictor
  // et rapports clients. Interval 24h.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "implicit-sla",
    intervalMs:
      Number(process.env.IMPLICIT_SLA_INTERVAL_MS) || 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { learnImplicitSlas } = await import("@/lib/ai/jobs/implicit-sla");
      const res = await learnImplicitSlas();
      if (res.written > 0) {
        console.log(
          `[implicit-sla] ${res.written}/${res.orgs} orgs avec SLA implicite calculé (${res.skipped} skippés)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // SLA DRIFT PREDICTOR — prédit les tickets qui vont breacher leur SLA
  // avant que ça arrive. Combine âge courant, deadline, médiane de
  // résolution des tickets sémantiquement proches, disponibilité assigné.
  // Alerte automatique (notification in-app) quand un ticket franchit 0.85
  // de risk score. Interval 15 min — fréquent pour capter les dérives.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "sla-drift-predictor",
    intervalMs: Number(process.env.SLA_DRIFT_INTERVAL_MS) || 15 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { predictSlaRisks } = await import(
        "@/lib/ai/jobs/sla-drift-predictor"
      );
      const res = await predictSlaRisks();
      if (res.atRisk > 0 || res.newAlerts > 0) {
        console.log(
          `[sla-drift] ${res.atRisk} ticket(s) à risque sur ${res.ticketsScanned} scannés, ${res.newAlerts} nouvelle(s) alerte(s)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // WORKLOAD OPTIMIZER — calcule une matrice d'expertise tech × catégorie
  // (speed, experience, quality). Alimente l'endpoint
  // /api/v1/tickets/[id]/suggest-assignee qui combine expertise × charge
  // courante pour proposer les meilleurs assignataires à la création.
  // Interval 24h — les expertises bougent lentement.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "workload-optimizer",
    intervalMs: Number(process.env.WORKLOAD_INTERVAL_MS) || 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { buildExpertiseMatrix } = await import(
        "@/lib/ai/jobs/workload-optimizer"
      );
      const res = await buildExpertiseMatrix();
      if (res.profilesWritten > 0) {
        console.log(
          `[workload] ${res.profilesWritten}/${res.techsProcessed} profils écrits, ${res.categoriesCovered} catégories couvertes`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // CLIENT HEALTH SCORE — agrégat 0-100 par client : ticketing, security,
  // backups, responsiveness, trend. Historique sur 30 snapshots pour tracer
  // la courbe. Alert quand un client perd ≥ 15 points en 7 jours.
  // Interval 2h — cible un équilibre entre réactivité et charge DB.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "client-health",
    intervalMs: Number(process.env.CLIENT_HEALTH_INTERVAL_MS) || 2 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { computeClientHealthScores } = await import(
        "@/lib/ai/jobs/client-health"
      );
      const res = await computeClientHealthScores();
      if (res.degraded > 0) {
        console.log(
          `[client-health] ${res.snapshots}/${res.orgs} snapshots, ${res.degraded} clients en dégradation notable`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // KB GAPS DETECTOR — croise audits + centroids + embeddings KB pour
  // produire une liste priorisée de « articles KB à écrire ». Catégories
  // avec disagreement rate élevé ET aucun article KB aligné → priorité
  // haute. Surfacable dans un dashboard admin / KB.
  // Interval 24h — analyse lente, dépend des autres jobs.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "kb-gaps-detector",
    intervalMs:
      Number(process.env.KB_GAPS_INTERVAL_MS) || 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectKbGaps } = await import(
        "@/lib/ai/jobs/kb-gaps-detector"
      );
      const res = await detectKbGaps();
      if (res.gapsDetected > 0) {
        console.log(
          `[kb-gaps] ${res.gapsDetected} lacune(s) détectée(s) sur ${res.categoriesAnalyzed} catégorie(s) analysée(s), ${res.gapsWritten} écrites`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // BUDGET TRACKER — suit la conso tokens + coût par feature sur 24h
  // glissantes. Si une feature dépasse son budget (cents/jour), écrit un
  // flag throttle qui force le router à utiliser Ollama local au lieu
  // d'OpenAI jusqu'au prochain reset (24h). Évite les dérives silencieuses.
  // Interval 60 min — suffisant pour détecter une boucle coûteuse.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "budget-tracker",
    intervalMs:
      Number(process.env.BUDGET_TRACKER_INTERVAL_MS) || 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runBudgetTracker } = await import(
        "@/lib/ai/jobs/budget-tracker"
      );
      const res = await runBudgetTracker();
      if (res.featuresThrottled > 0 || res.featuresReset > 0) {
        console.log(
          `[budget-tracker] ${res.featuresTracked} features trackées, ${res.featuresThrottled} throttlées, ${res.featuresReset} réactivées`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // TECH APPRENTI — extrait les "tickets exemplaires" par catégorie pour
  // servir de guide aux techs juniors. Critères : résolu par tech senior
  // (≥40 tickets résolus), temps ≤ médiane/2, notes internes riches, pas
  // de ré-ouverture. Stocké dans AiPattern(scope="apprenti:exemplars").
  // Interval 24h — les exemplaires bougent lentement.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "tech-apprenti",
    intervalMs:
      Number(process.env.APPRENTI_INTERVAL_MS) || 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { extractTechExemplars } = await import(
        "@/lib/ai/jobs/tech-apprenti"
      );
      const res = await extractTechExemplars();
      if (res.exemplarsWritten > 0) {
        console.log(
          `[tech-apprenti] ${res.exemplarsWritten} exemplaire(s) écrit(s) sur ${res.categoriesProcessed} catégorie(s) (${res.categoriesSkipped} skippées)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // DIGITAL TWIN — rejoue 15 tickets résolus par semaine à travers la stack
  // IA actuelle et mesure la précision vs catégorie humaine validée. Permet
  // de tracer une courbe d'accuracy dans le temps — signal fiable pour
  // détecter une régression causée par les feedback loops automatiques.
  // Coût : ~1.5¢/run (15 appels gpt-4o-mini). Weekly (168h).
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "digital-twin",
    intervalMs:
      Number(process.env.DIGITAL_TWIN_INTERVAL_MS) || 7 * 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runDigitalTwin } = await import("@/lib/ai/jobs/digital-twin");
      await runDigitalTwin();
    },
  });

  // -----------------------------------------------------------------------
  // SECURITY CORRELATION — corrèle les incidents de sécurité à travers
  // sources (Wazuh, Bitdefender, AD, etc.) qui partagent une entité
  // (endpoint, user, org) et une fenêtre temporelle. Permet de détecter
  // les chaînes d'attaque sans que 4 alertes soient traitées isolément.
  // Pas de LLM — pur graphe d'affinité + union-find. Interval 10 min.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "security-correlation",
    intervalMs:
      Number(process.env.SECURITY_CORR_INTERVAL_MS) || 10 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectSecurityCorrelations } = await import(
        "@/lib/ai/jobs/security-correlation"
      );
      const res = await detectSecurityCorrelations();
      if (res.chainsWritten > 0) {
        console.log(
          `[security-correlation] ${res.chainsDetected} chaîne(s) détectée(s), ${res.chainsWritten} écrite(s) (${res.incidentsScanned} incidents scannés)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // META-LEARNING — le système critique SES PROPRES apprentissages. Pour
  // chaque pattern appris (sanity stops, mappings, prompt guidance, etc.),
  // compare l'agreement rate audit avant/après son ajout. Les patterns qui
  // n'ont pas amélioré (ou ont dégradé) sont marqués "harmful" et filtrés
  // au runtime. Écrit aussi un health score global par feature.
  // Interval 24h — évaluation lente par nature.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "meta-learning",
    intervalMs:
      Number(process.env.META_LEARNING_INTERVAL_MS) || 24 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runMetaLearning } = await import(
        "@/lib/ai/jobs/meta-learning"
      );
      const res = await runMetaLearning();
      if (res.patternsEvaluated > 0 || res.featureHealthWritten > 0) {
        console.log(
          `[meta-learning] ${res.patternsEvaluated} patterns évalués : ${res.beneficial} bénéfiques, ${res.neutral} neutres, ${res.harmful} nocifs, ${res.insufficient} sans données suffisantes ; ${res.featureHealthWritten} feature health scores`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // KB INDEXER — embedde les articles KB publiés dans AiPattern et permet
  // le calcul en temps réel des suggestions par similarité sémantique avec
  // un ticket ouvert. Indexe par batch de 20, détecte les changements via
  // hash de contenu. Nettoie les embeddings orphelins.
  // -----------------------------------------------------------------------
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    scheduleJob({
      name: "kb-indexer",
      intervalMs: Number(process.env.KB_INDEX_INTERVAL_MS) || 30 * 60_000,
      isRunning: false,
      lastRun: null,
      lastError: null,
      consecutiveErrors: 0,
      run: async () => {
        const { indexKbArticles } = await import("@/lib/ai/jobs/kb-indexer");
        const res = await indexKbArticles();
        if (res.embedded > 0 || res.failed > 0) {
          console.log(
            `[kb-indexer] +${res.embedded} article(s) indexé(s), ${res.failed} échecs (${res.scanned} scannés)`,
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // PROMPT EVOLUTION — relit les audits "disagree/partial" et écrit des
  // règles d'amélioration CONCRÈTES pour chaque feature auditée. Ces règles
  // sont injectées runtime dans le prompt system via formatGuidanceForPrompt.
  // Les prompts s'améliorent seuls à partir de leurs propres échecs.
  // Interval 48h — laisse le temps d'accumuler suffisamment de signaux.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "prompt-evolution",
    intervalMs:
      Number(process.env.PROMPT_EVOLUTION_INTERVAL_MS) || 48 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { runPromptEvolution } = await import(
        "@/lib/ai/jobs/prompt-evolution"
      );
      const res = await runPromptEvolution();
      if (res.guidancesWritten > 0) {
        console.log(
          `[prompt-evolution] ${res.guidancesWritten} guidance(s) écrite(s) pour ${res.featuresProcessed} feature(s) (${res.skipped} skippées)`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // SEASONALITY DETECTOR — apprend les rythmes temporels d'apparition des
  // tickets par client × catégorie (90 jours, grille jour × tranche 3h).
  // Un slot "hot" (ratio ≥ 2× baseline) signale un créneau chroniquement
  // chargé → exploité par volume-anomaly (baseline plus juste) et triage
  // (ajustement priorité si ticket tombe dans un créneau récurrent).
  // Interval 12h — les rythmes évoluent lentement.
  // -----------------------------------------------------------------------
  scheduleJob({
    name: "seasonality-detector",
    intervalMs: Number(process.env.SEASONALITY_INTERVAL_MS) || 12 * 60 * 60_000,
    isRunning: false,
    lastRun: null,
    lastError: null,
    consecutiveErrors: 0,
    run: async () => {
      const { detectSeasonalityPatterns } = await import(
        "@/lib/ai/jobs/seasonality-detector"
      );
      const res = await detectSeasonalityPatterns();
      if (res.patternsWritten > 0) {
        console.log(
          `[seasonality] ${res.patternsWritten} pattern(s) temporel(s), ${res.hotSlots} hot slot(s) sur ${res.orgs} orgs`,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // PLAYBOOK MINER — clusters sémantiques de tickets résolus par catégorie
  // → extraction de runbooks via gpt-4o-mini (POLICY_KB_GEN preferOpenAI).
  // Les clusters ≥ 4 tickets produisent un playbook AiPattern ; ≥ 6 tickets
  // créent en plus un brouillon d'article KB (tags "playbook, auto-généré").
  // 14-day cooldown par (catégorie × hash cluster) pour éviter re-mining.
  // Interval 24h — coûteux (OpenAI + embeddings), volumineux patterns.
  // Guardé par OLLAMA car dépend des embeddings.
  // -----------------------------------------------------------------------
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    scheduleJob({
      name: "playbook-miner",
      intervalMs: Number(process.env.PLAYBOOK_INTERVAL_MS) || 24 * 60 * 60_000,
      isRunning: false,
      lastRun: null,
      lastError: null,
      consecutiveErrors: 0,
      run: async () => {
        const { minePlaybooks } = await import("@/lib/ai/jobs/playbook-miner");
        const res = await minePlaybooks();
        if (res.playbooksExtracted > 0 || res.kbDrafted > 0) {
          console.log(
            `[playbook] ${res.playbooksExtracted} playbook(s) extrait(s), ${res.kbDrafted} KB draft(s) créé(s) (${res.categoriesProcessed} catégories, ${res.clustersFound} clusters)`,
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // Ollama keep-warm — garde gemma3:12b chargé en VRAM pour éliminer les
  // cold starts (10-15 s de reload après 5 min d'inactivité Ollama).
  //
  // Interval 25 min → couvre le keep_alive 30 min configuré côté provider.
  // Léger : un ping /api/generate avec prompt vide, 0 token généré.
  // -----------------------------------------------------------------------
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    scheduleJob({
      name: "ollama-warmup",
      intervalMs: Number(process.env.OLLAMA_WARMUP_INTERVAL_MS) || 25 * 60_000,
      isRunning: false,
      lastRun: null,
      lastError: null,
      consecutiveErrors: 0,
      run: async () => {
        const { OllamaProvider } = await import(
          "@/lib/ai/orchestrator/providers/ollama"
        );
        const provider = new OllamaProvider();
        // Modèle principal (gemma3:12b par défaut) ET modèle léger si défini.
        const models = [
          process.env.OLLAMA_MODEL || "gemma3:12b",
          ...(process.env.OLLAMA_MODEL_SMALL
            ? [process.env.OLLAMA_MODEL_SMALL]
            : []),
        ];
        for (const m of models) {
          const ok = await provider.warmUp(m);
          if (!ok) {
            console.warn(`[ollama-warmup] échec pour ${m}`);
          }
        }
      },
    });
  }
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

/**
 * Déclenche un job immédiatement. Utilisé par l'API admin pour lancer un sync
 * sans attendre le prochain tick (ex: admin vient d'uploader des tickets et
 * veut extraire les faits tout de suite).
 *
 * Respecte le garde `isRunning` : si le job est déjà en cours, l'appel retourne
 * { ok: false, reason: "already_running" } sans déclencher un deuxième run en
 * parallèle. Les erreurs sont propagées au caller.
 */
export async function runJobNow(
  name: string,
): Promise<
  | { ok: true; durationMs: number }
  | {
      ok: false;
      reason: "not_found" | "already_running" | "failed";
      error?: string;
    }
> {
  const job = jobs.get(name);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.isRunning) return { ok: false, reason: "already_running" };

  job.isRunning = true;
  const start = Date.now();
  try {
    await job.run();
    job.lastRun = new Date();
    job.lastError = null;
    job.consecutiveErrors = 0;
    return { ok: true, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    job.lastError = msg;
    job.consecutiveErrors++;
    console.error(
      `[background-jobs] manual run of ${job.name} failed: ${msg}`,
    );
    return { ok: false, reason: "failed", error: msg };
  } finally {
    job.isRunning = false;
  }
}
