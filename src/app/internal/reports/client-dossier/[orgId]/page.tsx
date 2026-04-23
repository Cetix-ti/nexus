// Page de rendu HTML interne — cible Puppeteer. Auth par token signé.

import { notFound } from "next/navigation";
import { verifyDossierToken } from "@/lib/reports/dossier/token";
import { buildDossierPayload } from "@/lib/reports/dossier/builder";
import { ClientDossierDocument } from "@/components/reports/dossier/client-dossier-document";

export const dynamic = "force-dynamic";

export default async function InternalClientDossierRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orgId } = await params;
  const { token } = await searchParams;
  if (!token) return notFound();
  const verified = verifyDossierToken(token);
  if (!verified || verified.orgId !== orgId) return notFound();

  const payload = await buildDossierPayload(orgId);
  if (!payload) return notFound();

  return <ClientDossierDocument payload={payload} logoSrc="/images/cetix-logo-bleu-horizontal-HD.png" />;
}
