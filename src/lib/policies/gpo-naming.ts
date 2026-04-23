// Nomenclature GPO : préfixe auto dérivé du scope.
import type { GpoScope } from "@prisma/client";

const PREFIX: Record<GpoScope, string> = {
  COMPUTER: "c_",
  USER: "u_",
  MIXED: "cu_",
};

/** Nom computed = préfixe + stem. nameOverride bypass. */
export function computeGpoName(args: { scope: GpoScope; nameStem: string; nameOverride?: string | null }): string {
  if (args.nameOverride && args.nameOverride.trim()) return args.nameOverride.trim();
  return `${PREFIX[args.scope]}${args.nameStem}`;
}
