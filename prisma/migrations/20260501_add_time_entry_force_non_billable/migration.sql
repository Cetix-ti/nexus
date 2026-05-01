-- Persistance du flag manuel "Forcer non-facturable" sur TimeEntry, jusqu'ici
-- uniquement transmis comme input éphémère au moteur de billing. Permet de
-- filtrer/grouper les saisies non-facturables explicites (geste commercial)
-- dans les widgets analytics.

ALTER TABLE "time_entries" ADD COLUMN "force_non_billable" BOOLEAN NOT NULL DEFAULT false;

-- Backfill : les saisies existantes en non_billable dont le reason contient
-- "manuellement" (= sortie de l'engine quand forceNonBillable était à true)
-- → on les marque rétroactivement. Les autres non_billable (ex: dérivés
-- d'une absence de tarif) restent à false, ce qui est correct.
UPDATE "time_entries"
   SET "force_non_billable" = true
 WHERE "coverage_status" = 'non_billable'
   AND "coverage_reason" ILIKE '%manuellement%';

CREATE INDEX "time_entries_force_non_billable_idx" ON "time_entries"("force_non_billable");
