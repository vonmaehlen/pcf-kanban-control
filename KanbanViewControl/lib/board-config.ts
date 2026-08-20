import { IInputs } from "../generated/ManifestTypes";
import { resolveLocalizedDisplayName } from "./utils";

/**
 * Konsolidierte Konfiguration (Property "config", Inline-JSON).
 *
 * Ziel: EIN JSON statt ~20 einzelner JSON-Properties. Besonders die feldbezogenen
 * Einstellungen (vorher 13 Properties, alle nach Logicalname verschluesselt) liegen jetzt
 * gebuendelt unter card.fields[logicalName].
 *
 * Kompatibilitaet: Die alten Einzel-Properties funktionieren weiter. Aufgeloest wird PRO
 * EINSTELLUNG – liefert die Config einen Wert, gewinnt er; sonst greift die alte Property.
 * Deshalb kann schrittweise migriert werden.
 *
 * Robustheit: Ein defektes JSON schaltet nicht das Board ab. Laesst sich das Dokument nicht
 * parsen, gilt komplett die alte Konfiguration; ein defekter Abschnitt (z. B. card.fields ist
 * kein Objekt) wird einzeln verworfen. Beides landet im Konfigurationsfehler-Banner.
 */

/** Persona-Darstellung eines Lookup-Feldes: true = Persona, "iconOnly" = nur Icon. */
export type FieldPersona = boolean | "iconOnly";

export interface ConfigFieldSettings {
  hidden?: boolean;
  hideLabel?: boolean;
  /** String oder {locale: text}, z. B. {"de":"Betrag","en":"Amount"}. */
  displayName?: unknown;
  /** Breite in Prozent (1–100). */
  width?: number;
  maxHeightPx?: number;
  ellipsis?: boolean;
  lineBreaks?: boolean;
  html?: boolean;
  persona?: FieldPersona;
  /** Nur in diesen Spalten/Stages anzeigen. */
  visibleInStages?: string[];
  /** Rand-/Eckmarkierung, wenn das Feld gefuellt bzw. true ist. */
  highlight?: { color: string; type?: string };
  /** Kartenhintergrund nach Wert; erste zutreffende Regel gewinnt. */
  background?: { color: string; optionValue?: number[]; value?: string }[];
}

export interface ConfigQuickFilter {
  field: string;
  inPopup?: boolean;
}

export interface BoardConfig {
  view?: {
    default?: string;
    hide?: boolean;
    bpf?: { exclude?: unknown; stageOrder?: unknown; disable?: boolean };
  };
  board?: {
    hideEmptyColumns?: boolean;
    fullWidth?: boolean;
    minColumnWidth?: number;
    maxColumnWidth?: number;
    initialCardsVisible?: number;
    columnWidths?: unknown;
    allowCreateNew?: boolean;
    allowCardMove?: boolean;
    cardMoveValidation?: { function?: string; script?: string };
  };
  card?: {
    hideColumnField?: boolean;
    showOpenInNewTab?: boolean;
    showCreateActivity?: boolean;
    createActivityEntityType?: string;
    showSharePointFolder?: boolean;
    showEmailAndPhoneAsLinks?: boolean;
    html?: { allowedTags?: string; allowedAttributes?: string };
    fields?: Record<string, ConfigFieldSettings>;
  };
  filters?: {
    quickFilters?: ConfigQuickFilter[];
    sort?: { fields?: string[]; default?: { field?: string; direction?: string } };
    presets?: unknown;
  };
  notifications?: { position?: string };
}

/** Property-Name der konsolidierten Konfiguration (fuer Fehlermeldungen). */
export const CONFIG_PROPERTY_NAME = "config";

type Reporter = ((property: string, message: string) => void) | undefined;

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.map((v) => String(v).trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

function parseFieldSettings(raw: unknown): ConfigFieldSettings | undefined {
  const obj = asObject(raw);
  if (!obj) return undefined;
  const settings: ConfigFieldSettings = {};
  const hidden = asBool(obj.hidden);
  if (hidden !== undefined) settings.hidden = hidden;
  const hideLabel = asBool(obj.hideLabel);
  if (hideLabel !== undefined) settings.hideLabel = hideLabel;
  if (obj.displayName != null) settings.displayName = obj.displayName;
  const width = asPositiveNumber(obj.width);
  if (width !== undefined && width <= 100) settings.width = width;
  const maxHeightPx = asPositiveNumber(obj.maxHeightPx);
  if (maxHeightPx !== undefined) settings.maxHeightPx = maxHeightPx;
  const ellipsis = asBool(obj.ellipsis);
  if (ellipsis !== undefined) settings.ellipsis = ellipsis;
  const lineBreaks = asBool(obj.lineBreaks);
  if (lineBreaks !== undefined) settings.lineBreaks = lineBreaks;
  const html = asBool(obj.html);
  if (html !== undefined) settings.html = html;
  if (obj.persona === "iconOnly") settings.persona = "iconOnly";
  else {
    const persona = asBool(obj.persona);
    if (persona !== undefined) settings.persona = persona;
  }
  const stages = asStringArray(obj.visibleInStages);
  if (stages) settings.visibleInStages = stages;

  const highlight = asObject(obj.highlight);
  const highlightColor = highlight ? asTrimmedString(highlight.color) : undefined;
  if (highlightColor) {
    const type = asTrimmedString(highlight?.type);
    settings.highlight = { color: highlightColor, ...(type ? { type } : {}) };
  }

  if (Array.isArray(obj.background)) {
    type BackgroundRule = { color: string; optionValue?: number[]; value?: string };
    const rules = obj.background
      .map((entry): BackgroundRule | undefined => {
        const rule = asObject(entry);
        const color = rule ? asTrimmedString(rule.color) : undefined;
        if (!rule || !color) return undefined;
        const optionValues = (Array.isArray(rule.optionValue) ? rule.optionValue : [rule.optionValue])
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v));
        const value = asTrimmedString(rule.value);
        if (optionValues.length > 0) return { color, optionValue: optionValues };
        if (value !== undefined) return { color, value };
        return undefined;
      })
      .filter((r): r is BackgroundRule => r !== undefined);
    if (rules.length > 0) settings.background = rules;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function parseQuickFilters(raw: unknown): ConfigQuickFilter[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: ConfigQuickFilter[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const field = entry.trim();
      if (field) result.push({ field });
      continue;
    }
    const obj = asObject(entry);
    const field = obj ? asTrimmedString(obj.field) : undefined;
    if (!field) continue;
    const inPopup = asBool(obj?.inPopup);
    result.push({ field, ...(inPopup ? { inPopup: true } : {}) });
  }
  return result.length > 0 ? result : undefined;
}

/**
 * Parst das Config-JSON. Abschnittsweise robust: ein defekter Abschnitt wird verworfen und
 * gemeldet, die uebrigen bleiben nutzbar. Rueckgabe null = keine Config gesetzt oder das
 * Dokument ist unbrauchbar (dann gilt komplett die alte Konfiguration).
 */
export function parseBoardConfig(
  raw: string | undefined,
  reportConfigError?: Reporter,
  clearConfigError?: (property: string) => void
): BoardConfig | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let doc: Record<string, unknown> | undefined;
  try {
    doc = asObject(JSON.parse(trimmed));
  } catch (e) {
    reportConfigError?.(CONFIG_PROPERTY_NAME, e instanceof Error ? e.message : String(e));
    return null;
  }
  if (!doc) {
    reportConfigError?.(CONFIG_PROPERTY_NAME, "Config must be a JSON object, e.g. { \"card\": { ... } }");
    return null;
  }
  clearConfigError?.(CONFIG_PROPERTY_NAME);

  const config: BoardConfig = {};
  const sectionErrors: string[] = [];

  const view = asObject(doc.view);
  if (doc.view != null && !view) sectionErrors.push("view");
  if (view) {
    const bpf = asObject(view.bpf);
    config.view = {
      ...(asTrimmedString(view.default) !== undefined ? { default: asTrimmedString(view.default) } : {}),
      ...(asBool(view.hide) !== undefined ? { hide: asBool(view.hide) } : {}),
      ...(bpf
        ? {
            bpf: {
              ...(bpf.exclude != null ? { exclude: bpf.exclude } : {}),
              ...(bpf.stageOrder != null ? { stageOrder: bpf.stageOrder } : {}),
              ...(asBool(bpf.disable) !== undefined ? { disable: asBool(bpf.disable) } : {}),
            },
          }
        : {}),
    };
  }

  const board = asObject(doc.board);
  if (doc.board != null && !board) sectionErrors.push("board");
  if (board) {
    const validation = asObject(board.cardMoveValidation);
    config.board = {
      ...(asBool(board.hideEmptyColumns) !== undefined ? { hideEmptyColumns: asBool(board.hideEmptyColumns) } : {}),
      ...(asBool(board.fullWidth) !== undefined ? { fullWidth: asBool(board.fullWidth) } : {}),
      ...(asPositiveNumber(board.minColumnWidth) !== undefined ? { minColumnWidth: asPositiveNumber(board.minColumnWidth) } : {}),
      ...(asPositiveNumber(board.maxColumnWidth) !== undefined ? { maxColumnWidth: asPositiveNumber(board.maxColumnWidth) } : {}),
      ...(asPositiveNumber(board.initialCardsVisible) !== undefined ? { initialCardsVisible: asPositiveNumber(board.initialCardsVisible) } : {}),
      ...(board.columnWidths != null ? { columnWidths: board.columnWidths } : {}),
      ...(asBool(board.allowCreateNew) !== undefined ? { allowCreateNew: asBool(board.allowCreateNew) } : {}),
      ...(asBool(board.allowCardMove) !== undefined ? { allowCardMove: asBool(board.allowCardMove) } : {}),
      ...(validation
        ? {
            cardMoveValidation: {
              ...(asTrimmedString(validation.function) !== undefined ? { function: asTrimmedString(validation.function) } : {}),
              ...(asTrimmedString(validation.script) !== undefined ? { script: asTrimmedString(validation.script) } : {}),
            },
          }
        : {}),
    };
  }

  const card = asObject(doc.card);
  if (doc.card != null && !card) sectionErrors.push("card");
  if (card) {
    const html = asObject(card.html);
    const fieldsRaw = asObject(card.fields);
    if (card.fields != null && !fieldsRaw) sectionErrors.push("card.fields");
    const fields: Record<string, ConfigFieldSettings> = {};
    if (fieldsRaw) {
      for (const [name, value] of Object.entries(fieldsRaw)) {
        const fieldName = name.trim();
        if (!fieldName) continue;
        const settings = parseFieldSettings(value);
        if (settings) fields[fieldName] = settings;
      }
    }
    config.card = {
      ...(asBool(card.hideColumnField) !== undefined ? { hideColumnField: asBool(card.hideColumnField) } : {}),
      ...(asBool(card.showOpenInNewTab) !== undefined ? { showOpenInNewTab: asBool(card.showOpenInNewTab) } : {}),
      ...(asBool(card.showCreateActivity) !== undefined ? { showCreateActivity: asBool(card.showCreateActivity) } : {}),
      ...(asTrimmedString(card.createActivityEntityType) !== undefined ? { createActivityEntityType: asTrimmedString(card.createActivityEntityType) } : {}),
      ...(asBool(card.showSharePointFolder) !== undefined ? { showSharePointFolder: asBool(card.showSharePointFolder) } : {}),
      ...(asBool(card.showEmailAndPhoneAsLinks) !== undefined ? { showEmailAndPhoneAsLinks: asBool(card.showEmailAndPhoneAsLinks) } : {}),
      ...(html
        ? {
            html: {
              ...(html.allowedTags != null ? { allowedTags: String(html.allowedTags) } : {}),
              ...(html.allowedAttributes != null ? { allowedAttributes: String(html.allowedAttributes) } : {}),
            },
          }
        : {}),
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
    };
  }

  const filters = asObject(doc.filters);
  if (doc.filters != null && !filters) sectionErrors.push("filters");
  if (filters) {
    const sort = asObject(filters.sort);
    const sortDefault = sort ? asObject(sort.default) : undefined;
    const quickFilters = parseQuickFilters(filters.quickFilters);
    config.filters = {
      ...(quickFilters ? { quickFilters } : {}),
      ...(sort
        ? {
            sort: {
              ...(asStringArray(sort.fields) ? { fields: asStringArray(sort.fields) } : {}),
              ...(sortDefault
                ? {
                    default: {
                      ...(asTrimmedString(sortDefault.field) !== undefined ? { field: asTrimmedString(sortDefault.field) } : {}),
                      ...(sortDefault.direction === "desc" || sortDefault.direction === "asc"
                        ? { direction: sortDefault.direction }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(filters.presets != null ? { presets: filters.presets } : {}),
    };
  }

  const notifications = asObject(doc.notifications);
  if (doc.notifications != null && !notifications) sectionErrors.push("notifications");
  if (notifications) {
    const position = asTrimmedString(notifications.position);
    if (position) config.notifications = { position };
  }

  if (sectionErrors.length > 0) {
    reportConfigError?.(
      CONFIG_PROPERTY_NAME,
      `Ignored invalid section(s): ${sectionErrors.join(", ")}. Each section must be a JSON object.`
    );
  }

  return config;
}

/* ------------------------------------------------------------------ *
 * Zugriff: Config-Wert oder undefined (dann gilt die alte Property)  *
 * ------------------------------------------------------------------ */

/** Liest einen String-Property-Rohwert typsicher aus den (dynamischen) Parametern. */
export function rawParam(context: ComponentFramework.Context<IInputs>, name: string): string | undefined {
  const p = (context.parameters as unknown as Record<string, { raw?: string } | undefined>)[name];
  return p?.raw;
}

/** Liest einen Boolean-Property-Rohwert (TwoOptions) typsicher aus den Parametern. */
export function rawBoolParam(context: ComponentFramework.Context<IInputs>, name: string): boolean | undefined {
  const p = (context.parameters as unknown as Record<string, { raw?: boolean } | undefined>)[name];
  return p?.raw;
}

let cachedRaw: string | undefined;
let cachedConfig: BoardConfig | null = null;

/**
 * Geparste Config zum aktuellen Rohwert der Property. Modulweit gecacht, damit auch
 * Komponenten ohne Zugriff auf useMemo (Board, Column, index.ts) sie billig lesen koennen.
 * Fehler werden nicht von hier gemeldet – das passiert einmalig in App.tsx, wo der
 * Reporter fuer das Konfigurationsfehler-Banner verfuegbar ist.
 */
export function getBoardConfig(context: ComponentFramework.Context<IInputs>): BoardConfig | null {
  const raw = rawParam(context, CONFIG_PROPERTY_NAME);
  if (raw === cachedRaw) return cachedConfig;
  cachedRaw = raw;
  cachedConfig = parseBoardConfig(raw);
  return cachedConfig;
}

function valueAtPath(config: BoardConfig | null, path: string): unknown {
  if (!config) return undefined;
  let current: unknown = config;
  for (const segment of path.split(".")) {
    const obj = asObject(current);
    if (!obj) return undefined;
    current = obj[segment];
  }
  return current;
}

/** Boolean aus der Config, z. B. cfgBool(context, "board.hideEmptyColumns"). */
export function cfgBool(context: ComponentFramework.Context<IInputs>, path: string): boolean | undefined {
  return asBool(valueAtPath(getBoardConfig(context), path));
}

/** String aus der Config (leer = undefined). */
export function cfgString(context: ComponentFramework.Context<IInputs>, path: string): string | undefined {
  return asTrimmedString(valueAtPath(getBoardConfig(context), path));
}

/** Positive Zahl aus der Config. */
export function cfgNumber(context: ComponentFramework.Context<IInputs>, path: string): number | undefined {
  return asPositiveNumber(valueAtPath(getBoardConfig(context), path));
}

/** Roher Teilbaum der Config (fuer Abschnitte, die weiterhin als JSON weitergegeben werden). */
export function cfgValue(context: ComponentFramework.Context<IInputs>, path: string): unknown {
  return valueAtPath(getBoardConfig(context), path);
}

/* ------------------------------------------------------------------ *
 * Ableitungen aus card.fields in die intern genutzten Strukturen      *
 * ------------------------------------------------------------------ */

type BoolFieldKey = "hidden" | "hideLabel" | "ellipsis" | "lineBreaks" | "html";

/** Feldnamen, bei denen das Boolean-Flag true ist. undefined = Config sagt dazu nichts. */
export function cfgFieldFlagSet(config: BoardConfig | null, key: BoolFieldKey): Set<string> | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  let mentioned = false;
  const result = new Set<string>();
  for (const [name, settings] of Object.entries(fields)) {
    if (settings[key] === undefined) continue;
    mentioned = true;
    if (settings[key] === true) result.add(name);
  }
  return mentioned ? result : undefined;
}

/** Zahlenwerte je Feld (width, maxHeightPx). undefined = Config sagt dazu nichts. */
export function cfgFieldNumberMap(
  config: BoardConfig | null,
  key: "width" | "maxHeightPx"
): Map<string, number> | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  const result = new Map<string, number>();
  for (const [name, settings] of Object.entries(fields)) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) result.set(name, value);
  }
  return result.size > 0 ? result : undefined;
}

/** Anzeigenamen je Feld, bereits auf das Locale aufgeloest. */
export function cfgFieldDisplayNames(config: BoardConfig | null, locale: string): Map<string, string> | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  const result = new Map<string, string>();
  for (const [name, settings] of Object.entries(fields)) {
    if (settings.displayName == null) continue;
    result.set(name, resolveLocalizedDisplayName(settings.displayName, locale));
  }
  return result.size > 0 ? result : undefined;
}

/** Sichtbarkeit je Stage/Spalte. */
export function cfgFieldsVisiblePerStage(config: BoardConfig | null): Map<string, string[]> | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  const result = new Map<string, string[]>();
  for (const [name, settings] of Object.entries(fields)) {
    if (settings.visibleInStages && settings.visibleInStages.length > 0) {
      result.set(name, settings.visibleInStages);
    }
  }
  return result.size > 0 ? result : undefined;
}

/** Lookup-Persona: alle Felder mit persona true|"iconOnly" bzw. nur "iconOnly". */
export function cfgPersonaSets(
  config: BoardConfig | null
): { asPersona: Set<string>; iconOnly: Set<string> } | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  let mentioned = false;
  const asPersona = new Set<string>();
  const iconOnly = new Set<string>();
  for (const [name, settings] of Object.entries(fields)) {
    if (settings.persona === undefined) continue;
    mentioned = true;
    if (settings.persona === "iconOnly") {
      asPersona.add(name);
      iconOnly.add(name);
    } else if (settings.persona === true) {
      asPersona.add(name);
    }
  }
  return mentioned ? { asPersona, iconOnly } : undefined;
}

/** Rand-/Eckmarkierungen in der Reihenfolge der Felder im JSON. */
export function cfgHighlights(
  config: BoardConfig | null
): { logicalName: string; color: string; type?: string }[] | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  const result: { logicalName: string; color: string; type?: string }[] = [];
  for (const [name, settings] of Object.entries(fields)) {
    if (!settings.highlight) continue;
    result.push({ logicalName: name, color: settings.highlight.color, ...(settings.highlight.type ? { type: settings.highlight.type } : {}) });
  }
  return result.length > 0 ? result : undefined;
}

/** Hintergrundregeln in der Reihenfolge der Felder im JSON (erste Regel gewinnt). */
export function cfgBackgroundColors(
  config: BoardConfig | null
): { logicalName: string; color: string; optionValue?: number[]; value?: string }[] | undefined {
  const fields = config?.card?.fields;
  if (!fields) return undefined;
  const result: { logicalName: string; color: string; optionValue?: number[]; value?: string }[] = [];
  for (const [name, settings] of Object.entries(fields)) {
    for (const rule of settings.background ?? []) {
      result.push({ logicalName: name, ...rule });
    }
  }
  return result.length > 0 ? result : undefined;
}

/* ------------------------------------------------------------------ *
 * Migration: konsolidiertes JSON aus den alten Properties generieren  *
 * ------------------------------------------------------------------ */

/** Namen der alten (deprecated) Properties, die die Config ersetzt. */
export const LEGACY_PROPERTY_NAMES = [
  "defaultView", "hideViewBy", "disableBusinessProcessFlows", "filteredBusinessProcessFlows",
  "businessProcessFlowStepOrder", "hideEmptyColumns", "expandBoardToFullWidth", "minColumnWidth",
  "maxColumnWidth", "initialCardsVisible", "columnWidths", "allowCreateNew", "allowCardMove",
  "cardMoveValidationFunction", "cardMoveValidationScript", "hideColumnFieldOnCard",
  "showOpenInNewTabButton", "showCreateActivityButton", "createActivityEntityType",
  "showSharePointFolderButton", "showEmailAndPhoneAsLinks", "allowedHtmlTagsOnCard",
  "allowedHtmlAttributesOnCard", "hiddenFieldsOnCard", "hideLabelForFieldsOnCard",
  "fieldDisplayNamesOnCard", "fieldWidthsOnCard", "fieldMaxHeightOnCard", "ellipsisFieldsOnCard",
  "lineBreakFieldsOnCard", "htmlFieldsOnCard", "lookupFieldsAsPersonaOnCard",
  "lookupFieldsPersonaIconOnlyOnCard", "fieldsVisiblePerStage", "booleanFieldHighlights",
  "cardBackgroundColors", "quickFilterFields", "quickFilterFieldsInPopup", "sortFields",
  "defaultSort", "filterPresets", "notificationPosition",
] as const;

/** Toleranter Parser fuer die alten Listen-Properties (JSON-Array ODER kommagetrennt). */
function legacyNameList(raw: string | undefined): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : [];
    } catch {
      // Fallthrough auf kommagetrennt
    }
  }
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

function legacyJson(raw: string | undefined): unknown {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function legacyArray(raw: string | undefined): Record<string, unknown>[] {
  const parsed = legacyJson(raw);
  return Array.isArray(parsed) ? parsed.filter((e): e is Record<string, unknown> => asObject(e) !== undefined) : [];
}

/**
 * Baut aus den aktuell gesetzten alten Properties das aequivalente konsolidierte JSON.
 * Migrationshilfe: Ausgabe in die Property "config" kopieren, danach koennen die alten
 * Properties geleert werden. Nur gesetzte Werte landen im Ergebnis – Defaults bleiben weg,
 * damit die Ausgabe klein und lesbar bleibt.
 */
export function buildConfigFromLegacyParameters(context: ComponentFramework.Context<IInputs>): string {
  const str = (name: string) => asTrimmedString(rawParam(context, name));
  const bool = (name: string) => rawBoolParam(context, name);
  const num = (name: string) => asPositiveNumber(rawParam(context, name));

  const config: Record<string, unknown> = {};

  // --- view ---
  const view: Record<string, unknown> = {};
  if (str("defaultView")) view.default = str("defaultView");
  if (bool("hideViewBy") === true) view.hide = true;
  const bpf: Record<string, unknown> = {};
  if (bool("disableBusinessProcessFlows") === true) bpf.disable = true;
  const bpfExclude = legacyJson(rawParam(context, "filteredBusinessProcessFlows"));
  if (Array.isArray(bpfExclude) && bpfExclude.length > 0) bpf.exclude = bpfExclude;
  const stageOrder = legacyJson(rawParam(context, "businessProcessFlowStepOrder"));
  if (Array.isArray(stageOrder) && stageOrder.length > 0) bpf.stageOrder = stageOrder;
  if (Object.keys(bpf).length > 0) view.bpf = bpf;
  if (Object.keys(view).length > 0) config.view = view;

  // --- board ---
  const board: Record<string, unknown> = {};
  if (bool("hideEmptyColumns") === true) board.hideEmptyColumns = true;
  if (bool("expandBoardToFullWidth") === true) board.fullWidth = true;
  if (num("minColumnWidth") !== undefined) board.minColumnWidth = num("minColumnWidth");
  if (num("maxColumnWidth") !== undefined) board.maxColumnWidth = num("maxColumnWidth");
  if (num("initialCardsVisible") !== undefined) board.initialCardsVisible = num("initialCardsVisible");
  const columnWidths = legacyJson(rawParam(context, "columnWidths"));
  if (columnWidths !== undefined) board.columnWidths = columnWidths;
  if (bool("allowCreateNew") === false) board.allowCreateNew = false;
  if (bool("allowCardMove") === false) board.allowCardMove = false;
  const validation: Record<string, unknown> = {};
  if (str("cardMoveValidationFunction")) validation.function = str("cardMoveValidationFunction");
  if (str("cardMoveValidationScript")) validation.script = str("cardMoveValidationScript");
  if (Object.keys(validation).length > 0) board.cardMoveValidation = validation;
  if (Object.keys(board).length > 0) config.board = board;

  // --- card (ohne Felder) ---
  const card: Record<string, unknown> = {};
  if (bool("hideColumnFieldOnCard") === true) card.hideColumnField = true;
  if (bool("showOpenInNewTabButton") === true) card.showOpenInNewTab = true;
  if (bool("showCreateActivityButton") === true) card.showCreateActivity = true;
  if (str("createActivityEntityType")) card.createActivityEntityType = str("createActivityEntityType");
  if (bool("showSharePointFolderButton") === true) card.showSharePointFolder = true;
  if (bool("showEmailAndPhoneAsLinks") === true) card.showEmailAndPhoneAsLinks = true;
  const html: Record<string, unknown> = {};
  if (str("allowedHtmlTagsOnCard")) html.allowedTags = str("allowedHtmlTagsOnCard");
  if (str("allowedHtmlAttributesOnCard")) html.allowedAttributes = str("allowedHtmlAttributesOnCard");
  if (Object.keys(html).length > 0) card.html = html;

  // --- card.fields: die 13 feldbezogenen Properties zusammenfuehren ---
  const fields: Record<string, Record<string, unknown>> = {};
  const fieldOf = (name: string): Record<string, unknown> => {
    if (!fields[name]) fields[name] = {};
    return fields[name];
  };
  const flagProperties: [string, string][] = [
    ["hiddenFieldsOnCard", "hidden"],
    ["hideLabelForFieldsOnCard", "hideLabel"],
    ["ellipsisFieldsOnCard", "ellipsis"],
    ["lineBreakFieldsOnCard", "lineBreaks"],
    ["htmlFieldsOnCard", "html"],
  ];
  for (const [property, key] of flagProperties) {
    for (const name of legacyNameList(rawParam(context, property))) fieldOf(name)[key] = true;
  }
  for (const entry of legacyArray(rawParam(context, "fieldDisplayNamesOnCard"))) {
    const name = asTrimmedString(entry.logicalName);
    if (name && entry.displayName != null) fieldOf(name).displayName = entry.displayName;
  }
  for (const entry of legacyArray(rawParam(context, "fieldWidthsOnCard"))) {
    const name = asTrimmedString(entry.logicalName);
    const width = asPositiveNumber(entry.width);
    if (name && width !== undefined) fieldOf(name).width = width;
  }
  for (const entry of legacyArray(rawParam(context, "fieldMaxHeightOnCard"))) {
    const name = asTrimmedString(entry.logicalName);
    const maxHeightPx = asPositiveNumber(entry.maxHeightPx);
    if (name && maxHeightPx !== undefined) fieldOf(name).maxHeightPx = maxHeightPx;
  }
  for (const name of legacyNameList(rawParam(context, "lookupFieldsAsPersonaOnCard"))) {
    fieldOf(name).persona = true;
  }
  for (const name of legacyNameList(rawParam(context, "lookupFieldsPersonaIconOnlyOnCard"))) {
    fieldOf(name).persona = "iconOnly";
  }
  const perStage = asObject(legacyJson(rawParam(context, "fieldsVisiblePerStage")));
  if (perStage) {
    for (const [name, stages] of Object.entries(perStage)) {
      const list = asStringArray(stages);
      if (asTrimmedString(name) && list) fieldOf(name.trim()).visibleInStages = list;
    }
  }
  for (const entry of legacyArray(rawParam(context, "booleanFieldHighlights"))) {
    const name = asTrimmedString(entry.logicalName);
    const color = asTrimmedString(entry.color);
    if (!name || !color) continue;
    const type = asTrimmedString(entry.type);
    fieldOf(name).highlight = { color, ...(type && type !== "left" ? { type } : {}) };
  }
  for (const entry of legacyArray(rawParam(context, "cardBackgroundColors"))) {
    const name = asTrimmedString(entry.logicalName);
    const color = asTrimmedString(entry.color);
    if (!name || !color) continue;
    const optionValues = (Array.isArray(entry.optionValue) ? entry.optionValue : [entry.optionValue])
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    const value = asTrimmedString(entry.value);
    const rule =
      optionValues.length > 0
        ? { optionValue: optionValues.length === 1 ? optionValues[0] : optionValues, color }
        : value !== undefined
          ? { value, color }
          : undefined;
    if (!rule) continue;
    const target = fieldOf(name);
    target.background = [...((target.background as unknown[]) ?? []), rule];
  }
  if (Object.keys(fields).length > 0) card.fields = fields;
  if (Object.keys(card).length > 0) config.card = card;

  // --- filters ---
  const filters: Record<string, unknown> = {};
  const quickFilterFields = legacyNameList(rawParam(context, "quickFilterFields"));
  const inPopup = new Set(legacyNameList(rawParam(context, "quickFilterFieldsInPopup")));
  if (quickFilterFields.length > 0) {
    filters.quickFilters = quickFilterFields.map((field) =>
      inPopup.has(field) ? { field, inPopup: true } : field
    );
  }
  const sort: Record<string, unknown> = {};
  const sortFields = legacyNameList(rawParam(context, "sortFields"));
  if (sortFields.length > 0) sort.fields = sortFields;
  const defaultSort = asObject(legacyJson(rawParam(context, "defaultSort")));
  if (defaultSort) {
    const field = asTrimmedString(defaultSort.field);
    const direction = defaultSort.direction === "desc" ? "desc" : defaultSort.direction === "asc" ? "asc" : undefined;
    if (field) sort.default = { field, ...(direction ? { direction } : {}) };
  }
  if (Object.keys(sort).length > 0) filters.sort = sort;
  const presets = legacyJson(rawParam(context, "filterPresets"));
  if (Array.isArray(presets) && presets.length > 0) filters.presets = presets;
  if (Object.keys(filters).length > 0) config.filters = filters;

  // --- notifications ---
  const position = str("notificationPosition");
  if (position) config.notifications = { position };

  return JSON.stringify(config, null, 2);
}
