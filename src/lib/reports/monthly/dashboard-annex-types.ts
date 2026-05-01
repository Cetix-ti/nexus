// ============================================================================
// Types des annexes "Dashboards" jointes au PDF (option "PDF avec graphiques").
//
// Vit côté serveur : la page de rendu interne résout les widgets (exécute
// les queries) AVANT d'appeler le composant, qui ne fait que rendre les
// données déjà calculées.
// ============================================================================

export interface ResolvedAnnexWidget {
  id: string;
  title: string;
  /** Type de chart (Recharts). */
  chartType: string;
  /** Largeur dans le grid d'origine (1-12) — utilisée pour décider si le
   *  widget prend la pleine largeur ou la moitié dans le PDF. */
  span: number;
  /** Style visuel (couleurs, etc.) — passé tel quel à <WidgetChart>. */
  style?: Record<string, unknown>;
  /** Résultats résolus de la query. */
  results: Array<{ label: string; value: number }>;
  /** Total agrégé (utilisé par les widgets de type "number" ou "gauge"). */
  total: number;
  /** Erreur éventuelle d'exécution de la query — affichée comme message
   *  dans le widget plutôt que de planter le rendu complet. */
  error?: string;
}

export interface ResolvedDashboardAnnex {
  id: string;
  label: string;
  description?: string;
  widgets: ResolvedAnnexWidget[];
}
