import { CardWarning } from "../context/card-actions-context";

/** Orange (Fluent "warning"), gut unterscheidbar von Rot fuer Fehler/Ueberfaellig. */
export const DEFAULT_CARD_WARNING_COLOR = "#F7630C";

/** Argument fuer card.warning.function. */
export interface CardWarningArgs {
  recordId: string;
  entityName: string;
  /** Spalten-ID der Karte: Option-ID bei OptionSet-Views, Stage-Name bei BPF-Views. */
  columnId: unknown;
  columnTitle: string | null;
  /**
   * Rohwerte aller Spalten der View: Choice/Yes-No -> Option-ID (Multi-Select -> Array),
   * Lookup -> GUID, Text/Zahl/Datum unveraendert, leer -> null.
   */
  values: Record<string, unknown>;
}

/** Rohwert fuer Nicht-Choice-Spalten: Lookups auf die GUID reduzieren, Leerstring -> null. */
export function toWarningRawValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (Array.isArray(value)) return value.length === 0 ? null : value.map(toWarningRawValue);
  if (typeof value === "object" && "id" in (value as object)) {
    const id = (value as { id?: unknown }).id;
    const guid = id != null && typeof id === "object" && "guid" in (id as object) ? (id as { guid?: unknown }).guid : id;
    return guid != null ? String(guid).replace(/[{}]/g, "").toLowerCase() : null;
  }
  return value;
}

/** Ergebnis der Funktion normalisieren: null/leer -> keine Warnung, Text oder { message, color? }. */
export function toCardWarning(result: unknown, defaultColor: string): CardWarning | undefined {
  if (result == null || result === false) return undefined;
  if (typeof result === "string") {
    return result.trim() ? { message: result.trim(), color: defaultColor } : undefined;
  }
  if (typeof result === "object" && "message" in (result as object)) {
    const message = String((result as { message?: unknown }).message ?? "").trim();
    if (!message) return undefined;
    const color = (result as { color?: unknown }).color;
    return { message, color: typeof color === "string" && color.trim() ? color.trim() : defaultColor };
  }
  return undefined;
}
