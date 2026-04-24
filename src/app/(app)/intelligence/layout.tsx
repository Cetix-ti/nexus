// ============================================================================
// /intelligence/* — layout serveur qui gate toute la section sur SUPER_ADMIN.
//
// Les pages sont en "use client" et n'ont pas de guard propre ; un layout
// serveur est la façon propre de bloquer un accès direct via URL (sans passer
// par la sidebar) pour toute la sous-arborescence.
// ============================================================================

import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-utils";

export default async function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  if (!me || me.role !== "SUPER_ADMIN") {
    notFound();
  }
  return <>{children}</>;
}
