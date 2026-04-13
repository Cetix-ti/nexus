import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listRules() {
  return prisma.automationRule.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createRule(input: any) {
  return prisma.automationRule.create({
    data: {
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      conditions: input.conditions || {},
      actions: input.actions || {},
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateRule(id: string, patch: any) {
  return prisma.automationRule.update({ where: { id }, data: patch });
}

export async function deleteRule(id: string) {
  return prisma.automationRule.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// EXECUTION ENGINE
// Evaluates automation rules against ticket events and executes matching actions.
// ---------------------------------------------------------------------------

type TriggerEvent = "ticket_created" | "ticket_updated" | "ticket_status_changed" | "ticket_assigned" | "sla_breached";

interface TicketContext {
  id: string;
  subject: string;
  status: string;
  priority: string;
  type: string;
  organizationId: string;
  organizationName?: string;
  assigneeId: string | null;
  categoryName?: string;
  source: string;
  slaBreached: boolean;
  isOverdue: boolean;
  // For update events
  previousStatus?: string;
  previousAssigneeId?: string | null;
}

/** Check if a condition matches the ticket context. */
function evaluateCondition(condition: any, ticket: TicketContext): boolean {
  if (!condition || typeof condition !== "object") return true;

  const { field, operator, value } = condition;
  if (!field || !operator) return true;

  const ticketValue = (ticket as any)[field];
  if (ticketValue === undefined) return false;

  const tv = String(ticketValue).toLowerCase();
  const cv = String(value).toLowerCase();

  switch (operator) {
    case "equals": return tv === cv;
    case "not_equals": return tv !== cv;
    case "contains": return tv.includes(cv);
    case "not_contains": return !tv.includes(cv);
    case "in": return Array.isArray(value) ? value.map((v: string) => v.toLowerCase()).includes(tv) : false;
    case "not_in": return Array.isArray(value) ? !value.map((v: string) => v.toLowerCase()).includes(tv) : true;
    default: return false;
  }
}

/** Check if all conditions in a rule match. */
function evaluateConditions(conditions: any, ticket: TicketContext): boolean {
  if (!conditions) return true;
  if (Array.isArray(conditions)) {
    return conditions.every((c) => evaluateCondition(c, ticket));
  }
  if (typeof conditions === "object" && conditions.field) {
    return evaluateCondition(conditions, ticket);
  }
  return true;
}

/** Execute a single action against a ticket. */
async function executeAction(action: any, ticketId: string): Promise<void> {
  if (!action || !action.type) return;

  switch (action.type) {
    case "set_priority":
      if (action.value) {
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { priority: action.value.toUpperCase() },
        });
      }
      break;

    case "set_status":
      if (action.value) {
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { status: action.value.toUpperCase() },
        });
      }
      break;

    case "assign_to":
      if (action.userId) {
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { assigneeId: action.userId },
        });
      }
      break;

    case "assign_queue":
      if (action.queueId) {
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { queueId: action.queueId },
        });
      }
      break;

    case "set_category":
      if (action.categoryId) {
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { categoryId: action.categoryId },
        });
      }
      break;

    case "add_tag":
      if (action.tagId) {
        await prisma.ticketTag.upsert({
          where: { ticketId_tagId: { ticketId, tagId: action.tagId } },
          create: { ticketId, tagId: action.tagId },
          update: {},
        });
      }
      break;

    case "add_note":
      if (action.content) {
        // Find first admin user to use as author
        const admin = await prisma.user.findFirst({
          where: { role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] }, isActive: true },
          select: { id: true },
        });
        if (admin) {
          await prisma.comment.create({
            data: {
              ticketId,
              authorId: admin.id,
              body: `[Automatisation] ${action.content}`,
              isInternal: true,
            },
          });
        }
      }
      break;
  }
}

/**
 * Run all active automation rules against a ticket event.
 * Called from ticket service on create/update.
 */
export async function runAutomations(
  event: TriggerEvent,
  ticket: TicketContext,
): Promise<{ rulesMatched: number; actionsExecuted: number }> {
  let rulesMatched = 0;
  let actionsExecuted = 0;

  try {
    const rules = await prisma.automationRule.findMany({
      where: { isActive: true, trigger: event },
    });

    for (const rule of rules) {
      const conditions = rule.conditions as any;
      if (!evaluateConditions(conditions, ticket)) continue;

      rulesMatched++;
      const actions = rule.actions as any;
      const actionList = Array.isArray(actions) ? actions : actions ? [actions] : [];

      for (const action of actionList) {
        try {
          await executeAction(action, ticket.id);
          actionsExecuted++;
        } catch (err) {
          console.error(`[automation] Action failed for rule ${rule.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[automation] Engine error:", err);
  }

  return { rulesMatched, actionsExecuted };
}
