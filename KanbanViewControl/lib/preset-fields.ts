/**
 * Filter-Presets wirken nur auf Quick-Filter-Felder: applyFilterPreset liest den Wert ueber den Quick-Filter-Key
 * (oder dessen letzten Namensteil bei Link-Entity-Aliasen wie "a_123.ownerid"). Ein Preset-Feld ohne passenden
 * Quick Filter wurde bisher stillschweigend ignoriert (z. B. "Phase lt:60" ohne Quick Filter auf der Phase).
 * Diese Pruefung liefert solche Felder, damit das Board sie im Konfigurationsfehler-Banner meldet.
 */

export interface PresetLike {
  label: string;
  filters: Record<string, unknown>;
}

/** Preset-Felder, die kein geladener Quick Filter aufnimmt – gleiche Zuordnung wie applyFilterPreset. */
export const unappliedPresetFields = (
  presets: PresetLike[],
  quickFilterKeys: string[]
): { preset: string; field: string }[] => {
  const applied = new Set<string>();
  for (const key of quickFilterKeys) {
    applied.add(key);
    applied.add(key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key);
  }
  const result: { preset: string; field: string }[] = [];
  for (const p of presets) {
    for (const field of Object.keys(p.filters ?? {})) {
      if (!applied.has(field)) result.push({ preset: p.label, field });
    }
  }
  return result;
};

/** Text fuer den Banner, oder null wenn alles angewendet wird. */
export const unappliedPresetFieldsMessage = (missing: { preset: string; field: string }[]): string | null => {
  if (missing.length === 0) return null;
  const list = missing.map((m) => `"${m.field}" in "${m.preset}"`).join(", ");
  return `Ignored preset filter(s): ${list}. A preset only filters fields that are quick filters and part of the view – add them to filters.quickFilters (e.g. with "inPopup": true).`;
};
