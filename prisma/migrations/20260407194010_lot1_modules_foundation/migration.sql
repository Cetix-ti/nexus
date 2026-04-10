-- CreateEnum
CREATE TYPE "ApproverScope" AS ENUM ('ALL_TICKETS', 'HIGH_PRIORITY_ONLY', 'SPECIFIC_CATEGORIES', 'SPECIFIC_AMOUNTS');

-- CreateEnum
CREATE TYPE "BoardGroupBy" AS ENUM ('STATUS', 'ORGANIZATION', 'PRIORITY', 'SLA', 'ASSIGNEE', 'CATEGORY', 'TICKET_TYPE');

-- CreateEnum
CREATE TYPE "BoardShareScope" AS ENUM ('PRIVATE', 'TEAM', 'EVERYONE');

-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');

-- CreateTable
CREATE TABLE "org_approvers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "job_title" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "scope" "ApproverScope" NOT NULL DEFAULT 'ALL_TICKETS',
    "scope_min_amount" DOUBLE PRECISION,
    "notify_by_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_by_sms" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "total_approved" INTEGER NOT NULL DEFAULT 0,
    "total_rejected" INTEGER NOT NULL DEFAULT 0,
    "average_response_hours" DOUBLE PRECISION,
    "added_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_sla_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "low_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "low_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 72,
    "medium_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "medium_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "high_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "high_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "critical_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "critical_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_sla_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_sla_profile" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "low_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "low_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 72,
    "medium_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "medium_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "high_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "high_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "critical_first_response_hours" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "critical_resolution_hours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_sla_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_boards" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT '📋',
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "group_by" "BoardGroupBy" NOT NULL DEFAULT 'STATUS',
    "share_scope" "BoardShareScope" NOT NULL DEFAULT 'PRIVATE',
    "shared_with_group_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shared_with_group_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_org_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_tech_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_priorities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filter_ticket_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kanban_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kanban_board_columns" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "kanban_board_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_ticket_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organization_id" TEXT,
    "organization_name" TEXT,
    "frequency" TEXT NOT NULL,
    "schedule_config" JSONB NOT NULL,
    "time_of_day" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "ticket_subject" TEXT NOT NULL,
    "ticket_description" TEXT NOT NULL,
    "ticket_priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "ticket_type" "TicketType" NOT NULL DEFAULT 'SERVICE_REQUEST',
    "ticket_category_id" TEXT,
    "ticket_queue_id" TEXT,
    "ticket_assignee_id" TEXT,
    "ticket_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_ticket_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tiers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hourly_rate" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_integrations" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "auth_type" TEXT NOT NULL,
    "api_key" TEXT,
    "api_key_masked" TEXT,
    "api_base_url" TEXT,
    "oauth_client_id" TEXT,
    "oauth_access_token" TEXT,
    "oauth_refresh_token" TEXT,
    "oauth_expires_at" TIMESTAMP(3),
    "auto_sync" BOOLEAN NOT NULL DEFAULT false,
    "sync_interval_minutes" INTEGER,
    "last_sync_at" TIMESTAMP(3),
    "next_sync_at" TIMESTAMP(3),
    "total_records_synced" INTEGER NOT NULL DEFAULT 0,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_error_message" TEXT,
    "connected_by" TEXT,
    "connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_integration_mappings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_name" TEXT NOT NULL,
    "external_url" TEXT,
    "synced_record_type" TEXT,
    "synced_record_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "mapped_by" TEXT,
    "mapped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_integration_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_access_users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "portal_role" "PortalRole" NOT NULL DEFAULT 'VIEWER',
    "can_access_portal" BOOLEAN NOT NULL DEFAULT true,
    "can_see_own_tickets" BOOLEAN NOT NULL DEFAULT true,
    "can_see_all_org_tickets" BOOLEAN NOT NULL DEFAULT false,
    "can_create_tickets" BOOLEAN NOT NULL DEFAULT true,
    "can_see_projects" BOOLEAN NOT NULL DEFAULT false,
    "can_see_project_details" BOOLEAN NOT NULL DEFAULT false,
    "can_see_project_tasks" BOOLEAN NOT NULL DEFAULT false,
    "can_see_project_linked_tickets" BOOLEAN NOT NULL DEFAULT false,
    "can_see_reports" BOOLEAN NOT NULL DEFAULT false,
    "can_see_billing_reports" BOOLEAN NOT NULL DEFAULT false,
    "can_see_time_reports" BOOLEAN NOT NULL DEFAULT false,
    "can_see_hour_bank_balance" BOOLEAN NOT NULL DEFAULT false,
    "can_see_documents" BOOLEAN NOT NULL DEFAULT false,
    "can_see_team_members" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_access_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "organization_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "org_approvers_organization_id_idx" ON "org_approvers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_sla_overrides_organization_id_key" ON "org_sla_overrides"("organization_id");

-- CreateIndex
CREATE INDEX "kanban_board_columns_board_id_idx" ON "kanban_board_columns"("board_id");

-- CreateIndex
CREATE INDEX "recurring_ticket_templates_next_run_at_is_active_idx" ON "recurring_ticket_templates"("next_run_at", "is_active");

-- CreateIndex
CREATE INDEX "support_tiers_organization_id_idx" ON "support_tiers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_provider_key" ON "tenant_integrations"("provider");

-- CreateIndex
CREATE INDEX "org_integration_mappings_provider_idx" ON "org_integration_mappings"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "org_integration_mappings_organization_id_provider_key" ON "org_integration_mappings"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "portal_access_users_organization_id_idx" ON "portal_access_users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_users_organization_id_email_key" ON "portal_access_users"("organization_id", "email");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- AddForeignKey
ALTER TABLE "kanban_board_columns" ADD CONSTRAINT "kanban_board_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_integration_mappings" ADD CONSTRAINT "org_integration_mappings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "tenant_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
