import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { enrichFromWebsite } from "@/lib/enrichment/website-enricher";

/**
 * POST /api/v1/organizations/[id]/enrich
 *
 * Body: { website?: string }  (if omitted, uses the org's stored website)
 *
 * Scrapes the website and returns the extracted data WITHOUT applying it.
 * The client decides which fields to keep, then PATCH /organizations/[id]
 * to commit.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  const website = body.website || org.website;
  if (!website) {
    return NextResponse.json(
      { error: "Aucune URL de site web fournie" },
      { status: 400 }
    );
  }

  const result = await enrichFromWebsite(website);

  // Le scraper renvoie une URL absolue. Le navigateur du client ne pourra
  // probablement pas l'afficher (CORS / mixed content / hotlink bloqué).
  // On télécharge l'image côté serveur et on la retourne en data URI.
  if (result.logo && /^https?:\/\//.test(result.logo)) {
    try {
      const inlined = await inlineRemoteImage(result.logo);
      if (inlined) result.logo = inlined;
    } catch {
      /* on garde l'URL d'origine en fallback */
    }
  }

  // Mark the timestamp regardless — even partial enrichments count
  await prisma.organization.update({
    where: { id },
    data: { lastEnrichedAt: new Date(), website },
  });

  return NextResponse.json({ success: true, data: result });
}

const INLINE_IMAGE_MAX_BYTES = 500 * 1024;

async function inlineRemoteImage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      // Quelques sites bloquent les User-Agents par défaut sans hostname.
      "User-Agent":
        "Mozilla/5.0 (compatible; NexusEnricher/1.0; +https://nexus.local)",
      Accept: "image/*",
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const ct = (res.headers.get("content-type") || "image/png")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > INLINE_IMAGE_MAX_BYTES) return null;
  return `data:${ct};base64,${buf.toString("base64")}`;
}
