import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/v1/veeam/rematch
 * Re-matches all unmatched (organizationId=null) alerts against current org domains.
 * Useful after adding a domain to an organization.
 */
export async function POST() {
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

    // Find all unmatched alerts
    const unmatched = await prisma.veeamBackupAlert.findMany({
      where: { organizationId: null },
      select: { id: true, senderDomain: true },
    });

    let fixed = 0;
    for (const alert of unmatched) {
      const org = domainMap.get(alert.senderDomain);
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
