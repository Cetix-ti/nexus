// Cron hebdomadaire : résumé de la semaine envoyé chaque vendredi 17h.
// Appelé par systemd timer nexus-weekly-digest.timer.
//
// Phase actuelle : restreint à Bruno + Simon (voir
// WEEKLY_DIGEST_ALLOWED_FIRST_NAMES dans /lib/notifications/weekly-digest.ts).

import { runWeeklyDigest } from "@/lib/notifications/weekly-digest";

async function main() {
  console.log(`[weekly-digest] Démarrage`);
  const res = await runWeeklyDigest();
  console.log(
    `[weekly-digest] Terminé — ${res.sent.length}/${res.recipients} envoyés`,
    res.sent.length > 0 ? `(${res.sent.join(", ")})` : "",
    res.skipped.length > 0 ? `· skipped: ${res.skipped.join(", ")}` : "",
  );
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
