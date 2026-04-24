// ============================================================================
// /analytics/* — layout serveur qui gate toute la section derrière la
// capabilité "finances". Les rapports analytiques exposent des revenus
// par client, rentabilité, etc. → même restriction que Finances.
// ============================================================================

import { notFound } from "next/navigation";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  if (!me || !hasCapability(me, "finances")) {
    notFound();
  }
  return <>{children}</>;
}
