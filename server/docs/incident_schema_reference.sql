-- Reference SQL for Incident Notification System Tables
-- Safe non-destructive DDL (CREATE TABLE IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "incidents" (
    "id" TEXT NOT NULL,
    "incident_key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "affected_rooms" JSONB,
    "floor_breakdown" JSONB,
    "vlan_breakdown" JSONB,
    "suppressed_count" INTEGER NOT NULL DEFAULT 0,
    "escalation_count" INTEGER NOT NULL DEFAULT 0,
    "flapping_count" INTEGER NOT NULL DEFAULT 0,
    "telegram_status" TEXT NOT NULL DEFAULT 'PENDING',
    "email_status" TEXT NOT NULL DEFAULT 'PENDING',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_alert_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "incidents_status_category_idx" ON "incidents"("status", "category");
CREATE INDEX IF NOT EXISTS "incidents_incident_key_status_idx" ON "incidents"("incident_key", "status");
CREATE INDEX IF NOT EXISTS "incidents_occurred_at_idx" ON "incidents"("occurred_at");

CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

