// ============================================================================
// Parsing d'un wall-clock time avec zone → instant UTC (Date).
//
// Microsoft Graph renvoie ses événements avec un DateTime "naïf"
// (`2026-04-15T09:00:00.0000000`) accompagné d'un champ `timeZone`
// (`"America/Montreal"`). Le DateTime représente l'heure AU MUR dans
// cette zone — pas un instant UTC. Traiter ce string en lui ajoutant
// "Z" stocke l'événement avec un décalage égal à l'offset de la zone
// (4h pour EDT, 5h pour EST), ce qui fait "reculer" les événements
// matin/nuit d'un jour dans la grille calendaire.
//
// `zonedWallClockToUtc` utilise Intl.DateTimeFormat pour calculer
// l'offset de la zone cible à l'instant donné, puis l'applique.
// Gère correctement DST (heure d'été/heure normale) car l'offset
// dépend de la date elle-même.
// ============================================================================

/**
 * Convertit un wall-clock ISO local (sans "Z", sans "+HH:MM") dans une
 * timezone IANA en un Date représentant le vrai instant UTC.
 *
 * Exemples :
 *   zonedWallClockToUtc("2026-04-15T09:00:00", "America/Montreal")
 *     → Date instance pour 2026-04-15T13:00:00.000Z (EDT = UTC-4)
 *   zonedWallClockToUtc("2026-01-15T09:00:00", "America/Montreal")
 *     → Date instance pour 2026-01-15T14:00:00.000Z (EST = UTC-5)
 */
export function zonedWallClockToUtc(wallClock: string, timeZone: string): Date {
  // 1. On extrait les parties (année, mois, jour, heure, min, sec, ms)
  //    sans interpréter la timezone. On NE met PAS de Z volontairement.
  const m = wallClock.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) {
    // Format inconnu → fallback sur new Date() natif (meilleur effort).
    return new Date(wallClock);
  }
  const [, y, mo, d, h, mi, s, fracStr] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const hour = Number(h), minute = Number(mi), second = Number(s);
  const ms = fracStr ? Math.round(Number("0." + fracStr) * 1000) : 0;

  // 2. On construit un Date "candidat" en UTC avec ces parties (comme si
  //    le wall-clock était déjà UTC). Ce n'est pas le bon instant mais il
  //    tombe "à proximité" — on va l'ajuster.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);

  // 3. On calcule ce que cet instant UTC donne dans la zone cible.
  //    La différence entre ce qu'on obtient et le wall-clock voulu =
  //    l'offset que la zone avait à ce moment.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const tzYear = get("year"), tzMonth = get("month"), tzDay = get("day");
  const tzHour24 = get("hour") === 24 ? 0 : get("hour");
  const tzMinute = get("minute"), tzSecond = get("second");

  const tzMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour24, tzMinute, tzSecond, ms);
  const offset = tzMs - utcGuess; // ex. EDT : -4h, donc offset = -14_400_000

  // 4. L'instant UTC recherché = utcGuess - offset.
  //    Si tzMs est inférieur à utcGuess (ex. UTC 13h → EDT 9h), offset
  //    est négatif ; on doit reculer de |offset| depuis utcGuess pour
  //    obtenir l'instant UTC correspondant au wall-clock 9h EDT = 13h UTC.
  return new Date(utcGuess - offset);
}
