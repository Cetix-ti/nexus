-- Suivi des réponses clients non vues par l'agent. Permet une section
-- "Réponses reçues" dans le Kanban : tous les tickets dont le dernier
-- commentaire vient du contact (source portal/email) ET dont
-- lastClientReplyAcknowledgedAt < createdAt du dernier comment client.
-- Mis à jour automatiquement quand l'agent commente (le simple fait de
-- répondre vaut acknowledgment) ou via le bouton "Marquer comme vu".

ALTER TABLE "tickets" ADD COLUMN "last_client_reply_acknowledged_at" TIMESTAMP(3);

-- Index dédié à la requête "réponses non lues" : on filtre par status
-- ouvert + ack < createdAt du last comment. Postgres préfère un index
-- partiel pour cette query qui retourne <5% des rows.
CREATE INDEX "tickets_last_client_reply_ack_idx"
    ON "tickets"("last_client_reply_acknowledged_at");
