// ============================================================================
// /finances/* — layout serveur qui gate toute la section derrière la
// capabilité "finances". Pas de bypass implicite : même un SUPER_ADMIN doit
// avoir le tag (cohérent avec la règle de sidebar.tsx).
// ============================================================================

import { notFound } from "next/navigation";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";

export default async function FinancesLayout({
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
