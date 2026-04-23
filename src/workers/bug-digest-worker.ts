// Cron quotidien : envoi du digest des bugs.
// Appelé par systemd timer nexus-bug-digest.timer (voir scripts/systemd/).
//
// Par défaut : ne rien envoyer si aucune activité dans les 24h.
// Flag --force pour envoyer même sans activité.

import { sendDailyDigestEmail } from "@/lib/bugs/notifications";

async function main() {
  const force = process.argv.includes("--force");
  console.log(`[bug-digest] Démarrage (force=${force})`);
  const res = await sendDailyDigestEmail({ force });
  console.log(`[bug-digest] Résultat :`, res);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
