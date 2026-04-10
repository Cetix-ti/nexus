import { z } from "zod";

// ============================================================================
// Ticket Creation
// ============================================================================

export const createTicketSchema = z.object({
  organizationId: z.string().min(1, "Organization is required"),
  siteId: z.string().optional(),
  requesterId: z.string().optional(),
  assigneeId: z.string().optional(),
  categoryId: z.string().optional(),
  queueId: z.string().optional(),

  subject: z
    .string()
    .min(3, "Subject must be at least 3 characters")
    .max(255, "Subject must be under 255 characters"),
  description: z.string().min(1, "Description is required"),
  descriptionHtml: z.string().optional(),

  status: z
    .enum([
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_CLIENT",
      "WAITING_VENDOR",
      "SCHEDULED",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ])
    .optional()
    .default("NEW"),
  priority: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
    .optional()
    .default("MEDIUM"),
  urgency: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
    .optional()
    .default("MEDIUM"),
  impact: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
    .optional()
    .default("MEDIUM"),
  type: z
    .enum(["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE", "ALERT"])
    .optional()
    .default("INCIDENT"),
  source: z
    .enum([
      "PORTAL",
      "EMAIL",
      "PHONE",
      "CHAT",
      "API",
      "MONITORING",
      "AUTOMATION",
    ])
    .optional()
    .default("PORTAL"),

  dueAt: z.string().datetime().optional(),
  tagIds: z.array(z.string()).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

// ============================================================================
// Ticket Update
// ============================================================================

export const updateTicketSchema = z.object({
  subject: z
    .string()
    .min(3, "Subject must be at least 3 characters")
    .max(255, "Subject must be under 255 characters")
    .optional(),
  description: z.string().min(1).optional(),
  descriptionHtml: z.string().optional(),

  status: z
    .enum([
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_CLIENT",
      "WAITING_VENDOR",
      "SCHEDULED",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ])
    .optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  urgency: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  impact: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  type: z
    .enum(["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE", "ALERT"])
    .optional(),

  assigneeId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  queueId: z.string().nullable().optional(),
  siteId: z.string().nullable().optional(),
  requesterId: z.string().nullable().optional(),
  slaPolicyId: z.string().nullable().optional(),

  dueAt: z.string().datetime().nullable().optional(),
  isEscalated: z.boolean().optional(),

  tagIds: z.array(z.string()).optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// ============================================================================
// Ticket Filters (query params)
// ============================================================================

export const ticketFiltersSchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (typeof v === "string" ? v.split(",") : v)),
  priority: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (typeof v === "string" ? v.split(",") : v)),
  type: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (typeof v === "string" ? v.split(",") : v)),
  assigneeId: z.string().optional(),
  organizationId: z.string().optional(),
  categoryId: z.string().optional(),
  queueId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  isOverdue: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === "string" ? v === "true" : v)),
  isEscalated: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === "string" ? v === "true" : v)),
  slaBreached: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === "string" ? v === "true" : v)),
  page: z.coerce.number().int().positive().optional().default(1),
  perPage: z.coerce.number().int().positive().max(100).optional().default(25),
  sortBy: z
    .enum(["createdAt", "updatedAt", "priority", "status", "number", "dueAt"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type TicketFiltersInput = z.infer<typeof ticketFiltersSchema>;

// ============================================================================
// Comment
// ============================================================================

export const createCommentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty"),
  bodyHtml: z.string().optional(),
  isInternal: z.boolean().optional().default(false),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
