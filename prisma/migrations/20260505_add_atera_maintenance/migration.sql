-- ============================================================================
-- MAINTENANCE ATERA — Purge des actifs inactifs
-- ============================================================================
-- Trois tables :
--   - atera_exclusions : whitelist d'AgentID à ne JAMAIS purger
--   - atera_purge_logs : trace par agent purgé (audit, exportable en CSV)
--   - atera_alert_recipients : destinataires des emails récap après purge

-- ---------------------------------------------------------------------------
-- atera_exclusions
-- ---------------------------------------------------------------------------
CREATE TABLE "atera_exclusions" (
    "id" TEXT NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "machine_name" TEXT,
    "customer_name" TEXT,
    "reason" TEXT NOT NULL,
    "added_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atera_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "atera_exclusions_agent_id_key" ON "atera_exclusions"("agent_id");
CREATE INDEX "atera_exclusions_expires_at_idx" ON "atera_exclusions"("expires_at");

ALTER TABLE "atera_exclusions"
  ADD CONSTRAINT "atera_exclusions_added_by_id_fkey"
  FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- atera_purge_logs
-- ---------------------------------------------------------------------------
CREATE TABLE "atera_purge_logs" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "device_guid" TEXT,
    "machine_name" TEXT,
    "customer_name" TEXT,
    "os_type" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "days_since_last_seen" INTEGER,
    "purged_by_id" TEXT NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "linked_asset_id" TEXT,
    "linked_asset_action" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "purged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atera_purge_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "atera_purge_logs_batch_id_idx" ON "atera_purge_logs"("batch_id");
CREATE INDEX "atera_purge_logs_purged_by_id_purged_at_idx" ON "atera_purge_logs"("purged_by_id", "purged_at");
CREATE INDEX "atera_purge_logs_agent_id_idx" ON "atera_purge_logs"("agent_id");
CREATE INDEX "atera_purge_logs_linked_asset_id_idx" ON "atera_purge_logs"("linked_asset_id");

ALTER TABLE "atera_purge_logs"
  ADD CONSTRAINT "atera_purge_logs_purged_by_id_fkey"
  FOREIGN KEY ("purged_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- atera_alert_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE "atera_alert_recipients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atera_alert_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "atera_alert_recipients_user_id_key" ON "atera_alert_recipients"("user_id");
CREATE UNIQUE INDEX "atera_alert_recipients_email_key" ON "atera_alert_recipients"("email");

ALTER TABLE "atera_alert_recipients"
  ADD CONSTRAINT "atera_alert_recipients_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
