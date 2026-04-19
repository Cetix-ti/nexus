import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * POST /api/v1/veeam/rematch
 * Re-matches all unmatched (organizationId=null) alerts against current org domains.
 * Useful after adding a domain to an organization.
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Build domain map from all orgs
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, domain: true, domains: true },
    });
    const domainMap = new Map<string, { id: string; name: string }>();
    for (const org of orgs) {
      if (org.domain) {
        domainMap.set(org.domain.toLowerCase(), { id: org.id, name: org.name });
      }
      for (const d of org.domains ?? []) {
        if (d) domainMap.set(d.toLowerCase(), { id: org.id, name: org.name });
      }
    }

    // Build email → org map (Contacts) pour les alertes sur domaines publics
    // (Gmail/Outlook) qu'un admin a explicitement mappées via /map-email.
    // Sans cette passe, un rematch ne réassigne QUE les alertes de domaines
    // privés ; celles venant d'un Gmail resteraient null même après mapping.
    const contacts = await prisma.contact.findMany({
      where: { isActive: true },
      select: {
        email: true,
        organization: { select: { id: true, name: true } },
      },
    });
    const emailMap = new Map<string, { id: string; name: string }>();
    for (const c of contacts) {
      if (!c.email || !c.organization) continue;
      const k = c.email.toLowerCase().trim();
      if (!k) continue;
      if (!emailMap.has(k)) emailMap.set(k, c.organization);
    }

    // Find all unmatched alerts
    const unmatched = await prisma.veeamBackupAlert.findMany({
      where: { organizationId: null },
      select: { id: true, senderDomain: true, senderEmail: true },
    });

    let fixed = 0;
    for (const alert of unmatched) {
      const org =
        domainMap.get(alert.senderDomain) ??
        emailMap.get(alert.senderEmail.toLowerCase());
      if (org) {
        await prisma.veeamBackupAlert.update({
          where: { id: alert.id },
          data: { organizationId: org.id, organizationName: org.name },
        });
        fixed++;
      }
    }

    return NextResponse.json({
      total: unmatched.length,
      fixed,
      remaining: unmatched.length - fixed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
