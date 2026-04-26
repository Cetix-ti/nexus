// ============================================================================
// Audit log TimeEntry (Phase 10D).
//
// Helper unique pour écrire un événement d'audit sur une saisie de temps.
// Always best-effort — un échec de log ne doit pas casser l'action métier.
// ============================================================================

import prisma from "@/lib/prisma";

export type TimeEntryAuditAction =
  | "create"
  | "create_on_behalf_of"
  | "update"
  | "transition"
  | "delete";

export async function writeTimeEntryAudit(
  timeEntryId: string,
  actorUserId: string | null,
  action: TimeEntryAuditAction,
  opts: {
    from?: Record<string, unknown> | null;
    to?: Record<string, unknown> | null;
    note?: string | null;
  } = {},
): Promise<void> {
  try {
    await prisma.timeEntryAuditLog.create({
      data: {
        timeEntryId,
        actorUserId,
        action,
        fromValue: (opts.from ?? null) as never,
        toValue: (opts.to ?? null) as never,
        note: opts.note ?? null,
      },
    });
  } catch (e) {
    // Loggue mais ne propage pas — l'action métier doit aboutir.
    console.error("[time-entry-audit] failed:", e);
  }
}
