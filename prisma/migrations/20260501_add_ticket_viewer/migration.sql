-- Présence des agents sur la page d'un ticket. Heartbeat agent toutes les
-- 15s côté client → upsert lastSeenAt. La fenêtre d'activité (lastSeenAt
-- > now - 30s) détermine "qui consulte ce ticket en ce moment". Cleanup
-- au unmount client (best-effort) + GC implicite par la fenêtre.

CREATE TABLE "ticket_viewers" (
    "id"           TEXT NOT NULL,
    "ticket_id"    TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_viewers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_viewers_ticket_id_user_id_key"
    ON "ticket_viewers"("ticket_id", "user_id");

CREATE INDEX "ticket_viewers_ticket_id_last_seen_at_idx"
    ON "ticket_viewers"("ticket_id", "last_seen_at");

ALTER TABLE "ticket_viewers" ADD CONSTRAINT "ticket_viewers_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_viewers" ADD CONSTRAINT "ticket_viewers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
