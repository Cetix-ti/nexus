import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** GET /api/v1/contacts/search?q=xxx — search contacts across all orgs */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      organization: { select: { id: true, name: true, logo: true } },
      portalAccess: { select: { portalRole: true } },
    },
    orderBy: [{ portalEnabled: "desc" }, { lastName: "asc" }],
    take: 20,
  });

  return NextResponse.json(
    contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      jobTitle: c.jobTitle,
      portalEnabled: c.portalEnabled,
      portalRole: c.portalAccess?.portalRole ?? null,
      organizationId: c.organization.id,
      organizationName: c.organization.name,
      organizationLogo: c.organization.logo,
    })),
  );
}
