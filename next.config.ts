import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    // Explicit subnets
    "10.10.2.*",
    "10.102.2.*",
    "10.200.241.*",
    // Broad RFC1918 private ranges
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
  images: {
    remotePatterns: [],
  },
  async redirects() {
    // Intelligence IA : anciens sous-onglets → pages consolidées avec ?tab=.
    return [
      { source: "/intelligence/activity",          destination: "/intelligence/learning?tab=activity",    permanent: false },
      { source: "/intelligence/feedback",          destination: "/intelligence/learning?tab=feedback",    permanent: false },
      { source: "/intelligence/similar-learning",  destination: "/intelligence/learning?tab=similar",     permanent: false },
      { source: "/intelligence/category-learning", destination: "/intelligence/learning?tab=category",    permanent: false },
      { source: "/intelligence/taxonomy",          destination: "/intelligence/learning?tab=taxonomy",    permanent: false },
      { source: "/intelligence/anomalies",         destination: "/intelligence/detections?tab=recurring", permanent: false },
      { source: "/intelligence/recurring",         destination: "/intelligence/detections?tab=recurring", permanent: false },
      { source: "/intelligence/security-chains",   destination: "/intelligence/detections?tab=security",  permanent: false },
      { source: "/intelligence/maintenance",       destination: "/intelligence/proposals?tab=maintenance",permanent: false },
      { source: "/intelligence/kb-gaps",           destination: "/intelligence/proposals?tab=kb-gaps",    permanent: false },
      { source: "/intelligence/playbooks",         destination: "/intelligence/proposals?tab=playbooks",  permanent: false },
      // Raccourcis courriel : les courriels de notification utilisent
      // l'URL courte /TK-NNNN ou /INT-NNNN (cf. getAgentTicketUrl). Sans
      // ces redirects, le clic depuis la boîte mail tombait en 500
      // (aucune route Next.js ne matche au root). Ces redirects pointent
      // vers la vraie page /tickets/[id] qui sait résoudre les slugs.
      { source: "/TK-:num(\\d+)",  destination: "/tickets/TK-:num",  permanent: false },
      { source: "/INT-:num(\\d+)", destination: "/tickets/INT-:num", permanent: false },
    ];
  },
};

export default nextConfig;
