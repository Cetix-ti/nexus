// ============================================================================
// PERSISTENCE EMAIL SENDER
//
// Rendu du template HTML stocké en DB (SecurityNotificationTemplate) avec
// substitution de placeholders {{name}}, puis envoi via Microsoft Graph
// (sendMail sur le compte `informatique@cetix.ca` déjà utilisé pour
// monitoring). Les credentials Azure sont les mêmes que email-sync.ts.
// ============================================================================

import prisma from "@/lib/prisma";
import {
  DEFAULT_PERSISTENCE_HTML,
  DEFAULT_PERSISTENCE_TEXT,
  DEFAULT_PERSISTENCE_SUBJECT,
  DEFAULT_PERSISTENCE_RECIPIENTS,
} from "./default-template";
import { severityStyle } from "./severity";
import type { SecuritySeverity } from "../types";

const TEMPLATE_KIND = "persistence_tool";
const SENDER_MAILBOX = process.env.SECURITY_ALERT_SENDER || "informatique@cetix.ca";

export interface PersistenceEmailContext {
  hostname: string;
  clientCode: string;
  clientName: string;
  ipAddress: string;
  softwareName: string;
  softwareNameNormalized: string;
  softwareVersion: string;
  severity: SecuritySeverity;
  detectionTime: Date;
  ruleId: string;
  ruleLevel: number;
  module: string;
  rawSubject: string;
  rawDescription: string;
  whitelistAllowed: "yes" | "no" | "never";
  whitelistLevel: string;
  whitelistNotes: string;
  alertId?: string;
}

// ---------------------------------------------------------------------------
// Template loading / seeding
// ---------------------------------------------------------------------------

export async function getOrSeedPersistenceTemplate() {
  const existing = await prisma.securityNotificationTemplate.findUnique({
    where: { kind: TEMPLATE_KIND },
  });
  if (existing) return existing;
  return prisma.securityNotificationTemplate.create({
    data: {
      kind: TEMPLATE_KIND,
      enabled: true,
      recipients: DEFAULT_PERSISTENCE_RECIPIENTS,
      subject: DEFAULT_PERSISTENCE_SUBJECT,
      htmlBody: DEFAULT_PERSISTENCE_HTML,
      textBody: DEFAULT_PERSISTENCE_TEXT,
    },
  });
}

// ---------------------------------------------------------------------------
// Placeholder rendering
// ---------------------------------------------------------------------------

function formatFrenchDate(d: Date): string {
  const weekdays = [
    "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
  ];
  const dayName = weekdays[d.getDay()];
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${dayName} ${year}-${month}-${day} (${hours}:${minutes})`;
}

function buildPlaceholders(ctx: PersistenceEmailContext): Record<string, string> {
  const style = severityStyle(ctx.severity);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nexus.cetix.ca";
  const alertUrl = ctx.alertId
    ? `${appUrl}/security-center?tab=persistence&alert=${ctx.alertId}`
    : `${appUrl}/security-center?tab=persistence`;
  return {
    hostname: ctx.hostname || "N/A",
    clientCode: ctx.clientCode || "N/A",
    clientName: ctx.clientName || ctx.clientCode || "N/A",
    ipAddress: ctx.ipAddress || "N/A",
    softwareName: ctx.softwareName || "N/A",
    softwareNameNormalized: ctx.softwareNameNormalized || ctx.softwareName || "N/A",
    softwareVersion: ctx.softwareVersion || "N/A",
    severity: ctx.severity,
    severityLabel: style.label,
    severityBadgeBg: style.badgeBg,
    severityBadgeText: style.badgeText,
    severityAccent: style.accent,
    detectionTime: formatFrenchDate(ctx.detectionTime),
    ruleId: ctx.ruleId || "N/A",
    ruleLevel: String(ctx.ruleLevel || "N/A"),
    module: ctx.module || "Wazuh",
    rawSubject: ctx.rawSubject || "",
    rawDescription: ctx.rawDescription || "",
    whitelistAllowed: ctx.whitelistAllowed,
    whitelistLevel: ctx.whitelistLevel || "none",
    whitelistNotes: ctx.whitelistNotes || "—",
    appUrl,
    alertUrl,
  };
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(
  template: string,
  placeholders: Record<string, string>,
  escape: boolean,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = placeholders[key];
    if (v == null) return "";
    return escape ? escapeHtml(v) : v;
  });
}

// ---------------------------------------------------------------------------
// Graph token + send
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) throw new Error(`Graph OAuth ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// ---------------------------------------------------------------------------
// Send persistence alert
// ---------------------------------------------------------------------------

export async function sendPersistenceAlertEmail(
  ctx: PersistenceEmailContext,
): Promise<{ sent: boolean; reason?: string }> {
  const tpl = await getOrSeedPersistenceTemplate();
  if (!tpl.enabled) return { sent: false, reason: "disabled" };
  if (!tpl.recipients || tpl.recipients.length === 0) {
    return { sent: false, reason: "no_recipients" };
  }

  const placeholders = buildPlaceholders(ctx);
  // Subject & text rendered without HTML escaping; HTML body escapes values.
  const subject = renderTemplate(tpl.subject, placeholders, false);
  const html = renderTemplate(tpl.htmlBody, placeholders, true);
  const text = tpl.textBody ? renderTemplate(tpl.textBody, placeholders, false) : undefined;

  const token = await getGraphToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_MAILBOX)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: tpl.recipients.map((addr) => ({
            emailAddress: { address: addr },
          })),
        },
        saveToSentItems: false,
      }),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph sendMail ${res.status}: ${txt.slice(0, 300)}`);
  }
  // Silence unused-var warning — text is reserved for a future SMTP fallback.
  void text;
  return { sent: true };
}

export const PERSISTENCE_TEMPLATE_KIND = TEMPLATE_KIND;
