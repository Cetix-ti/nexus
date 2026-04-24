"use client";

// Redirection douce /analytics → /analytics/dashboards. Sert :
//   - Le breadcrumb "Analytique" (construit segment par segment),
//     qui pointe naturellement vers /analytics.
//   - Tout lien externe ou signet qui vise la racine de la section.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyticsIndex() {
  const router = useRouter();
  useEffect(() => { router.replace("/analytics/dashboards"); }, [router]);
  return null;
}
