import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";

/**
 * Legacy route `/organizations/[id]` — redirige systématiquement vers la
 * route canonique `/organisations/[slug]` en utilisant `clientCode` ou
 * `slug` pour garder des URLs lisibles dans la barre d'adresse.
 *
 * L'ancienne page (1640 lignes) reste sauvegardée sous `page.legacy.tsx.bak`
 * au cas où il faudrait y revenir.
 */
export default async function LegacyOrgRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // L'ID peut en réalité déjà être un clientCode ou un slug si quelque part
  // dans le code on a utilisé l'ancienne route sans cuid. On ne cherche
  // donc pas seulement par id.
  const org = await prisma.organization.findFirst({
    where: {
      OR: [
        { id },
        { clientCode: { equals: id, mode: "insensitive" } },
        { slug: { equals: id, mode: "insensitive" } },
      ],
    },
    select: { id: true, clientCode: true, slug: true },
  });

  if (!org) notFound();

  const seg = org.clientCode || org.slug || org.id;
  redirect(`/organisations/${encodeURIComponent(seg)}`);
}
