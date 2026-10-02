/**
 * Formularwahl beim Oeffnen und Anlegen (Config card.openForm.formIdByField).
 *
 * Bewusst ohne Imports: die Datei wird von lib/form-id.test.mjs direkt mit node geprueft.
 *
 * Beispiel:
 *   "card": { "openForm": { "formIdByField": {
 *     "field": "cre56_type",
 *     "map": { "1": "<form id Co-Branding>", "2": "<form id Retail>", "3": "<form id Retail>" },
 *     "default": "<form id Retail>"
 *   } } }
 *
 * `map` ordnet Feldwerten (Option-ID, Ja/Nein als "1"/"0", Lookup-GUID, Text) eine
 * Formular-ID zu. `default` (optional) gilt, wenn der Wert fehlt oder nicht in `map` steht.
 * Ohne Treffer und ohne `default` wird ohne formId geoeffnet – Dynamics waehlt das Formular.
 */
export interface FormIdByFieldConfig {
  field: string;
  map: Record<string, string>;
  default?: string;
}

function normalizeGuid(value: string): string {
  return value.replace(/[{}]/g, "").trim().toLowerCase();
}

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalizeGuid(value));
}

/** Validiert den Config-Abschnitt; ungueltige Eintraege fallen weg, ganz ungueltig -> undefined. */
export function parseFormIdByField(raw: unknown): FormIdByFieldConfig | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const field = typeof obj.field === "string" ? obj.field.trim() : "";
  if (!field) return undefined;

  const map: Record<string, string> = {};
  const rawMap = obj.map;
  if (rawMap != null && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    for (const [key, value] of Object.entries(rawMap as Record<string, unknown>)) {
      if (typeof value === "string" && isGuid(value)) {
        map[normalizeKey(key)] = normalizeGuid(value);
      }
    }
  }

  const fallback = typeof obj.default === "string" && isGuid(obj.default) ? normalizeGuid(obj.default) : undefined;
  if (Object.keys(map).length === 0 && !fallback) return undefined;

  return { field, map, ...(fallback ? { default: fallback } : {}) };
}

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  return isGuid(trimmed) ? normalizeGuid(trimmed) : trimmed.toLowerCase();
}

/**
 * Rohwert aus dataset record.getValue() bzw. dem Spaltenwert beim Anlegen als Map-Schluessel:
 * Zahl/Text -> String, Boolean -> "1"/"0" (wie Ja/Nein-Spaltenwerte), Lookup ({ id: { guid } } oder { id }) -> GUID.
 */
export function formIdKey(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return value.trim() === "" ? undefined : normalizeKey(value);
  if (Array.isArray(value)) return value.length > 0 ? formIdKey(value[0]) : undefined;
  if (typeof value === "object" && "id" in (value as object)) {
    const id = (value as { id?: unknown }).id;
    const guid = id != null && typeof id === "object" && "guid" in (id as object) ? (id as { guid?: unknown }).guid : id;
    return guid != null ? normalizeGuid(String(guid)) : undefined;
  }
  return undefined;
}

/** Formular-ID fuer einen Feldwert, sonst default, sonst undefined. */
export function resolveFormId(config: FormIdByFieldConfig | undefined, value: unknown): string | undefined {
  if (!config) return undefined;
  const key = formIdKey(value);
  if (key !== undefined && config.map[key]) return config.map[key];
  return config.default;
}
