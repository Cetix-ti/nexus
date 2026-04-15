"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useOrgLogosStore } from "@/stores/org-logos-store";

/**
 * Affiche le logo d'une organisation — charge automatiquement le store
 * des logos au montage si nécessaire, et tombe sur les initiales avec
 * un gradient stable sinon. Utilisé partout où on mentionne une org
 * (fiche ticket, quick-view Kanban, carte projet, etc.) pour garder un
 * rendu uniforme.
 */
export interface OrgLogoProps {
  /** Nom de l'organisation (clé d'indexation du store). */
  name: string;
  /** Logo explicite — si fourni, court-circuite le store. */
  logo?: string | null;
  /** Taille en px (carré). Défaut 24. */
  size?: number;
  /** Rayon : "sm" (rounded-md) | "full" (rounded-full). Défaut "sm". */
  rounded?: "sm" | "md" | "lg" | "full";
  /** Classes CSS additionnelles sur le wrapper. */
  className?: string;
  /** Title attribute. Défaut = name. */
  title?: string;
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Gradient stable dérivé d'un hash du nom. */
const GRADIENTS = [
  "from-blue-500 to-blue-700",
  "from-emerald-500 to-emerald-700",
  "from-violet-500 to-violet-700",
  "from-amber-500 to-amber-700",
  "from-rose-500 to-rose-700",
  "from-cyan-500 to-cyan-700",
  "from-indigo-500 to-indigo-700",
  "from-pink-500 to-pink-700",
];
function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

const RADIUS_CLASSES: Record<NonNullable<OrgLogoProps["rounded"]>, string> = {
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  full: "rounded-full",
};

export function OrgLogo({
  name,
  logo,
  size = 24,
  rounded = "sm",
  className,
  title,
}: OrgLogoProps) {
  const storeLogo = useOrgLogosStore((s) => s.logos[name]);
  const load = useOrgLogosStore((s) => s.load);
  const loaded = useOrgLogosStore((s) => s.loaded);

  useEffect(() => {
    // Déclenche un chargement unique du store (idempotent).
    if (!loaded) load();
  }, [loaded, load]);

  const src = logo ?? storeLogo ?? null;
  const r = RADIUS_CLASSES[rounded];
  const fontSize = Math.max(9, Math.round(size * 0.34));
  const style = { width: size, height: size } as const;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        title={title ?? name}
        className={cn(
          r,
          "object-contain bg-white ring-1 ring-slate-200/80 shrink-0",
          className,
        )}
        style={style}
      />
    );
  }

  return (
    <div
      title={title ?? name}
      className={cn(
        r,
        "bg-gradient-to-br flex items-center justify-center text-white font-semibold ring-2 ring-white shadow-sm shrink-0",
        gradientFor(name),
        className,
      )}
      style={{ ...style, fontSize }}
    >
      {getInitials(name)}
    </div>
  );
}
