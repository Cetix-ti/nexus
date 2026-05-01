-- Délai d'escalade configurable par approbateur. Si une approbation
-- PENDING ciblant un approbateur de niveau N reste sans réponse plus
-- de escalateAfterHours, un job background bascule sur le niveau N+1
-- (et notifie le N+1, plus rappel au N1). NULL = pas d'escalade auto
-- (comportement legacy : le N1 reste responsable indéfiniment).
ALTER TABLE "org_approvers" ADD COLUMN "escalate_after_hours" INTEGER;
