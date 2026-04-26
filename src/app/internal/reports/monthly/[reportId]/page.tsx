// ============================================================================
// PAGE DE RENDU INTERNE — Rapport mensuel client (Puppeteer target).
//
// Auth : token signé court dans ?token=. La page n'est pas listée dans le
// sitemap et n'est accessible qu'avec un jeton valide pour le reportId. Le
// service PDF génère ce token juste avant l'appel.
//
// Flow : verify token → load payload from DB → render HTML.
// ============================================================================

import { notFound } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import prisma from "@/lib/prisma";
import { verifyReportToken } from "@/lib/reports/monthly/token";
import { MonthlyReportDocument } from "@/components/reports/monthly/monthly-report-document";
import type { MonthlyReportPayload } from "@/lib/reports/monthly/types";

export const dynamic = "force-dynamic";

// Pairing tech moderne : Geist (display + body, Vercel-grade, géométrique
// avec personnalité — référence du design tech actuel) + Geist Mono pour
// les chiffres techniques. Un seul shipping de famille pour cohérence
// type Apple SF Pro, peak « young + modern + IT ».
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
  weight: ["300", "400", "500", "600", "700", "800"],
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
  weight: ["400", "500", "600"],
});

export default async function InternalMonthlyReportRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reportId } = await params;
  const { token } = await searchParams;

  if (!token) return notFound();
  const verified = verifyReportToken(token);
  if (!verified || verified.reportId !== reportId) return notFound();

  const report = await prisma.monthlyClientReport.findUnique({
    where: { id: reportId },
    select: { id: true, payloadJson: true },
  });
  if (!report) return notFound();

  const payload = report.payloadJson as unknown as MonthlyReportPayload;

  // Logo servi depuis /public. En dev + prod, même URL.
  const logoSrc = "/images/cetix-logo-bleu-horizontal-HD.png";

  return (
    <div className={`${geist.variable} ${geistMono.variable}`}>
      <MonthlyReportDocument payload={payload} logoSrc={logoSrc} />
    </div>
  );
}
