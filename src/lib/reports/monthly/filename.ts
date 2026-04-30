// ============================================================================
// Nom de fichier normalisé pour les exports PDF des rapports mensuels.
//
// Format : `{CODE}-RAPPORT-{YYMMDD}-1.pdf`
//   CODE   : clientCode UPPERCASE de l'org si présent, sinon slug UPPERCASE
//            (ex: SADB pour Ville de Sainte-Anne-de-Bellevue)
//   YYMMDD : dernier jour du mois de la période (ex: 260430 pour avril 2026)
//   -1     : suffixe de version. Statique pour l'instant ; pourra évoluer en
//            n° de révision si on commence à versionner les regen.
//
// Variante « avec montants $ » (agents seulement) → suffixe `-MONTANTS` :
//   SADB-RAPPORT-260430-1-MONTANTS.pdf
//
// Le format est compatible avec un tri lexicographique chronologique : les
// rapports d'un même client se rangent naturellement dans l'ordre de la
// période quand on les liste dans un dossier.
// ============================================================================

export function buildReportFilename(opts: {
  clientCode?: string | null;
  slug: string;
  period: Date;
  withAmounts?: boolean;
}): string {
  const code = (opts.clientCode || opts.slug || "RAPPORT")
    .toUpperCase()
    // Strip tout ce qui n'est pas alphanumérique pour produire un nom sain
    // (slugs avec tirets, accents importés de Freshservice…).
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");

  // Dernier jour du mois de la période. La période stockée est typiquement
  // le 1er du mois (ex: 2026-04-01) — on prend J-1 du mois suivant pour
  // que le nom reflète la fin de la période couverte.
  const p = opts.period;
  const lastDay = new Date(p.getFullYear(), p.getMonth() + 1, 0);
  const yy = String(lastDay.getFullYear()).slice(-2);
  const mm = String(lastDay.getMonth() + 1).padStart(2, "0");
  const dd = String(lastDay.getDate()).padStart(2, "0");
  const yymmdd = `${yy}${mm}${dd}`;

  const suffix = opts.withAmounts ? "-MONTANTS" : "";
  return `${code}-RAPPORT-${yymmdd}-1${suffix}.pdf`;
}
