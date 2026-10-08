/**
 * Strukturvergleich zweier transformierter Karten (bzw. ihrer Werte) fuer die
 * Wiederverwendung ueber Dataset-Refreshes. Deckt alle angezeigten und ausgewerteten Werte
 * ab (CardInfo, Lookups, Rohwerte, __values, __search); Date per Zeitstempel. Klassen-
 * instanzen ohne eigene Felder oder zu tiefe Verschachtelung gelten als ungleich (-> Karte wird neu gerendert).
 */
export function cardValuesEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    // NaN === NaN fuer Rohwerte
    return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
  }
  if (depth > 6) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!cardValuesEqual(a[i], b[i], depth + 1)) return false;
    }
    return true;
  }
  const protoA = Object.getPrototypeOf(a);
  if (protoA !== Object.getPrototypeOf(b)) return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  // Klasseninstanzen (z. B. EntityReference-Objekte der Plattform) nur ueber ihre eigenen
  // Felder vergleichbar. Ohne eigene Felder (Werte evtl. nur per Getter) -> konservativ ungleich.
  const isPlain = protoA === Object.prototype || protoA === null;
  if (!isPlain && keysA.length === 0) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!cardValuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1)) return false;
  }
  return true;
}
