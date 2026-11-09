/**
 * Leere Kartenfelder. Ein leeres Feld mit Beschriftung zeigt sonst „Label: -“; mit
 * card.fields.<feld>.hideWhenEmpty entfaellt es ganz (z. B. „Nächstes Ops ToDo“, wenn keins offen ist).
 * Ohne Abhaengigkeiten, damit node die Datei direkt testen kann (empty-field.test.mjs).
 */

/** Wert gilt auf der Karte als leer (gleiche Regel wie isNullOrEmpty plus „Unallocated“). */
export function isCardFieldValueEmpty(value: unknown): boolean {
  return !value || value === "Unallocated";
}

/** true = das Feld wird auf der Karte gar nicht gerendert. */
export function isCardFieldOmitted(
  value: unknown,
  options: { hasLabel: boolean; hideWhenEmpty: boolean }
): boolean {
  if (!isCardFieldValueEmpty(value)) return false;
  return options.hideWhenEmpty || !options.hasLabel;
}
