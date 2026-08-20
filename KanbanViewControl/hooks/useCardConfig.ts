import { useMemo } from "react";
import { IInputs } from "../generated/ManifestTypes";
import { parseFieldNameSet, parseFieldDisplayNames } from "../lib/utils";
import {
  BoardConfig,
  cfgFieldFlagSet,
  cfgFieldNumberMap,
  cfgFieldDisplayNames,
  cfgFieldsVisiblePerStage,
  cfgPersonaSets,
  cfgHighlights,
  cfgBackgroundColors,
} from "../lib/board-config";
import {
  CardConfig,
  BooleanFieldHighlightConfig,
  CardBackgroundColorConfig,
  HighlightType,
} from "../context/card-config-context";

type ReportConfigError = (property: string, message: string) => void;
type ClearConfigError = (property: string) => void;

/** Liest einen String-Property-Rohwert typsicher aus den (dynamischen) Komponenten-Parametern. */
function rawOf(context: ComponentFramework.Context<IInputs>, name: string): string | undefined {
  const p = (context.parameters as unknown as Record<string, { raw?: string } | undefined>)[name];
  return p?.raw;
}

function boolOf(context: ComponentFramework.Context<IInputs>, name: string): boolean {
  const p = (context.parameters as unknown as Record<string, { raw?: boolean } | undefined>)[name];
  return p?.raw === true;
}

/**
 * Parst alle karten-bezogenen Komponenten-Properties EINMAL zentral (memoisiert auf die
 * jeweiligen Roh-Strings) und bündelt sie zu einem CardConfig. Ersetzt die zuvor pro Karte
 * wiederholten JSON.parse-Aufrufe (großer Performance-Hebel bei vielen Karten).
 */
export function useCardConfig(
  context: ComponentFramework.Context<IInputs>,
  locale: string,
  reportConfigError?: ReportConfigError,
  clearConfigError?: ClearConfigError,
  /** Konsolidierte Konfiguration; gewinnt pro Einstellung ueber die alten Properties. */
  boardConfig?: BoardConfig | null,
): CardConfig {
  const hideColumnFieldOnCardRaw =
    boardConfig?.card?.hideColumnField ?? boolOf(context, "hideColumnFieldOnCard");
  const showEmailAndPhoneAsLinksRaw =
    boardConfig?.card?.showEmailAndPhoneAsLinks ?? boolOf(context, "showEmailAndPhoneAsLinks");

  const hiddenFieldsRaw = rawOf(context, "hiddenFieldsOnCard");
  const htmlFieldsRaw = rawOf(context, "htmlFieldsOnCard");
  const hideLabelRaw = rawOf(context, "hideLabelForFieldsOnCard");
  const lookupPersonaRaw = rawOf(context, "lookupFieldsAsPersonaOnCard");
  const lookupPersonaIconOnlyRaw = rawOf(context, "lookupFieldsPersonaIconOnlyOnCard");
  const ellipsisRaw = rawOf(context, "ellipsisFieldsOnCard");
  const lineBreakRaw = rawOf(context, "lineBreakFieldsOnCard");
  const fieldsVisiblePerStageRaw = rawOf(context, "fieldsVisiblePerStage");
  const booleanHighlightsRaw = rawOf(context, "booleanFieldHighlights");
  const cardBackgroundColorsRaw = rawOf(context, "cardBackgroundColors");
  const fieldWidthsRaw = rawOf(context, "fieldWidthsOnCard");
  const fieldMaxHeightRaw = rawOf(context, "fieldMaxHeightOnCard");
  const fieldDisplayNamesRaw = rawOf(context, "fieldDisplayNamesOnCard");

  const hiddenFieldsOnCardSet = useMemo(
    () =>
      cfgFieldFlagSet(boardConfig ?? null, "hidden") ??
      parseFieldNameSet(hiddenFieldsRaw, "hiddenFieldsOnCard", reportConfigError, clearConfigError),
    [boardConfig, hiddenFieldsRaw, reportConfigError, clearConfigError]
  );
  const htmlFieldsOnCardSet = useMemo(
    () =>
      cfgFieldFlagSet(boardConfig ?? null, "html") ??
      parseFieldNameSet(htmlFieldsRaw, "htmlFieldsOnCard", reportConfigError, clearConfigError),
    [boardConfig, htmlFieldsRaw, reportConfigError, clearConfigError]
  );
  const hideLabelForFieldsOnCardSet = useMemo(
    () =>
      cfgFieldFlagSet(boardConfig ?? null, "hideLabel") ??
      parseFieldNameSet(hideLabelRaw, "hideLabelForFieldsOnCard", reportConfigError, clearConfigError),
    [boardConfig, hideLabelRaw, reportConfigError, clearConfigError]
  );
  const personaSets = useMemo(() => cfgPersonaSets(boardConfig ?? null), [boardConfig]);
  const lookupFieldsAsPersonaOnCardSet = useMemo(
    () =>
      personaSets?.asPersona ??
      parseFieldNameSet(lookupPersonaRaw, "lookupFieldsAsPersonaOnCard", reportConfigError, clearConfigError),
    [personaSets, lookupPersonaRaw, reportConfigError, clearConfigError]
  );
  const lookupFieldsPersonaIconOnlyOnCardSet = useMemo(
    () =>
      personaSets?.iconOnly ??
      parseFieldNameSet(lookupPersonaIconOnlyRaw, "lookupFieldsPersonaIconOnlyOnCard", reportConfigError, clearConfigError),
    [personaSets, lookupPersonaIconOnlyRaw, reportConfigError, clearConfigError]
  );
  const ellipsisFieldsOnCardSet = useMemo(
    () =>
      cfgFieldFlagSet(boardConfig ?? null, "ellipsis") ??
      parseFieldNameSet(ellipsisRaw, "ellipsisFieldsOnCard", reportConfigError, clearConfigError),
    [boardConfig, ellipsisRaw, reportConfigError, clearConfigError]
  );
  const lineBreakFieldsOnCardSet = useMemo(
    () =>
      cfgFieldFlagSet(boardConfig ?? null, "lineBreaks") ??
      parseFieldNameSet(lineBreakRaw, "lineBreakFieldsOnCard", reportConfigError, clearConfigError),
    [boardConfig, lineBreakRaw, reportConfigError, clearConfigError]
  );

  /** Map: Feld-Logicalname -> Liste der Spalten/Stages, in denen das Feld sichtbar ist. */
  const fieldsVisiblePerStageMap = useMemo((): Map<string, string[]> => {
    const fromConfig = cfgFieldsVisiblePerStage(boardConfig ?? null);
    if (fromConfig) return fromConfig;
    const raw = fieldsVisiblePerStageRaw?.trim();
    if (!raw) return new Map();
    try {
      const obj = JSON.parse(raw);
      if (obj == null || typeof obj !== "object") return new Map();
      clearConfigError?.("fieldsVisiblePerStage");
      const map = new Map<string, string[]>();
      for (const [key, value] of Object.entries(obj)) {
        const fieldName = String(key).trim();
        if (!fieldName) continue;
        const stages = Array.isArray(value)
          ? (value as unknown[]).map((s) => String(s).trim()).filter(Boolean)
          : [];
        if (stages.length > 0) map.set(fieldName, stages);
      }
      return map;
    } catch (e) {
      reportConfigError?.("fieldsVisiblePerStage", e instanceof Error ? e.message : String(e));
      return new Map();
    }
  }, [boardConfig, fieldsVisiblePerStageRaw, reportConfigError, clearConfigError]);

  const booleanFieldHighlights = useMemo((): BooleanFieldHighlightConfig[] => {
    const fromConfig = cfgHighlights(boardConfig ?? null);
    if (fromConfig) {
      const validTypes: HighlightType[] = ["left", "right", "cornerTopRight", "cornerBottomRight", "cornerTopLeft", "cornerBottomLeft"];
      return fromConfig.map((h) => ({
        logicalName: h.logicalName,
        color: h.color,
        type: validTypes.includes((h.type ?? "left") as HighlightType) ? ((h.type ?? "left") as HighlightType) : "left",
      }));
    }
    const raw = booleanHighlightsRaw?.trim();
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      clearConfigError?.("booleanFieldHighlights");
      const validTypes: HighlightType[] = ["left", "right", "cornerTopRight", "cornerBottomRight", "cornerTopLeft", "cornerBottomLeft"];
      return arr
        .filter((e: unknown) => e && typeof e === "object" && "logicalName" in e && "color" in e)
        .map((e: { logicalName: string; color: string; type?: string }) => {
          const typeRaw = e.type != null ? String(e.type).trim() : "left";
          const type = validTypes.includes(typeRaw as HighlightType) ? (typeRaw as HighlightType) : "left";
          return {
            logicalName: String(e.logicalName).trim(),
            color: String(e.color).trim(),
            type,
          };
        })
        .filter((e) => e.logicalName && e.color);
    } catch (e) {
      reportConfigError?.("booleanFieldHighlights", e instanceof Error ? e.message : String(e));
      return [];
    }
  }, [boardConfig, booleanHighlightsRaw, reportConfigError, clearConfigError]);

  /**
   * Kartenhintergrund nach Feldwert. Regeln in Konfigurationsreihenfolge; pro Regel entweder
   * `optionValue` (numerische Option-ID(s), sprachunabhaengig – bevorzugt fuer Choice/Status/
   * Boolean) oder `value` (Textvergleich auf dem formatierten Wert). Regeln ohne Farbe,
   * ohne Feld oder ohne Bedingung werden verworfen.
   */
  const cardBackgroundColors = useMemo((): CardBackgroundColorConfig[] => {
    const fromConfig = cfgBackgroundColors(boardConfig ?? null);
    if (fromConfig) return fromConfig;
    const raw = cardBackgroundColorsRaw?.trim();
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      clearConfigError?.("cardBackgroundColors");
      return arr
        .filter((e: unknown) => e && typeof e === "object")
        .map((e: { logicalName?: unknown; color?: unknown; optionValue?: unknown; value?: unknown }) => {
          const optionValues = (Array.isArray(e.optionValue) ? e.optionValue : [e.optionValue])
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v));
          const textValue = e.value != null ? String(e.value).trim() : "";
          const rule: CardBackgroundColorConfig = {
            logicalName: e.logicalName != null ? String(e.logicalName).trim() : "",
            color: e.color != null ? String(e.color).trim() : "",
            ...(optionValues.length > 0 ? { optionValue: optionValues } : {}),
            ...(textValue !== "" ? { value: textValue } : {}),
          };
          return rule;
        })
        .filter((e) => e.logicalName && e.color && (e.optionValue != null || e.value != null));
    } catch (e) {
      reportConfigError?.("cardBackgroundColors", e instanceof Error ? e.message : String(e));
      return [];
    }
  }, [boardConfig, cardBackgroundColorsRaw, reportConfigError, clearConfigError]);

  const fieldWidthsOnCardMap = useMemo((): Map<string, number> => {
    const fromConfig = cfgFieldNumberMap(boardConfig ?? null, "width");
    if (fromConfig) return fromConfig;
    const raw = fieldWidthsRaw?.trim();
    if (!raw) return new Map();
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Map();
      clearConfigError?.("fieldWidthsOnCard");
      const map = new Map<string, number>();
      for (const e of arr) {
        if (e && typeof e === "object" && "logicalName" in e && "width" in e) {
          const name = String(e.logicalName).trim();
          const w = Number(e.width);
          if (name && !isNaN(w) && w > 0 && w <= 100) map.set(name, w);
        }
      }
      return map;
    } catch (e) {
      reportConfigError?.("fieldWidthsOnCard", e instanceof Error ? e.message : String(e));
      return new Map();
    }
  }, [boardConfig, fieldWidthsRaw, reportConfigError, clearConfigError]);

  const fieldMaxHeightOnCardMap = useMemo((): Map<string, number> => {
    const fromConfig = cfgFieldNumberMap(boardConfig ?? null, "maxHeightPx");
    if (fromConfig) return fromConfig;
    const raw = fieldMaxHeightRaw?.trim();
    if (!raw) return new Map();
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Map();
      clearConfigError?.("fieldMaxHeightOnCard");
      const map = new Map<string, number>();
      for (const e of arr) {
        if (e && typeof e === "object" && "logicalName" in e && "maxHeightPx" in e) {
          const name = String(e.logicalName).trim();
          const h = Number(e.maxHeightPx);
          if (name && !isNaN(h) && h > 0) map.set(name, h);
        }
      }
      return map;
    } catch (e) {
      reportConfigError?.("fieldMaxHeightOnCard", e instanceof Error ? e.message : String(e));
      return new Map();
    }
  }, [boardConfig, fieldMaxHeightRaw, reportConfigError, clearConfigError]);

  const fieldDisplayNamesOnCardMap = useMemo(
    () =>
      cfgFieldDisplayNames(boardConfig ?? null, locale) ??
      parseFieldDisplayNames(fieldDisplayNamesRaw, locale, reportConfigError, clearConfigError),
    [boardConfig, fieldDisplayNamesRaw, locale, reportConfigError, clearConfigError]
  );

  return useMemo(
    (): CardConfig => ({
      hideColumnFieldOnCard: hideColumnFieldOnCardRaw,
      hiddenFieldsOnCardSet,
      fieldsVisiblePerStageMap,
      htmlFieldsOnCardSet,
      hideLabelForFieldsOnCardSet,
      booleanFieldHighlights,
      cardBackgroundColors,
      fieldWidthsOnCardMap,
      lookupFieldsAsPersonaOnCardSet,
      lookupFieldsPersonaIconOnlyOnCardSet,
      showEmailAndPhoneAsLinks: showEmailAndPhoneAsLinksRaw,
      ellipsisFieldsOnCardSet,
      lineBreakFieldsOnCardSet,
      fieldMaxHeightOnCardMap,
      fieldDisplayNamesOnCardMap,
    }),
    [
      hideColumnFieldOnCardRaw,
      hiddenFieldsOnCardSet,
      fieldsVisiblePerStageMap,
      htmlFieldsOnCardSet,
      hideLabelForFieldsOnCardSet,
      booleanFieldHighlights,
      cardBackgroundColors,
      fieldWidthsOnCardMap,
      lookupFieldsAsPersonaOnCardSet,
      lookupFieldsPersonaIconOnlyOnCardSet,
      showEmailAndPhoneAsLinksRaw,
      ellipsisFieldsOnCardSet,
      lineBreakFieldsOnCardSet,
      fieldMaxHeightOnCardMap,
      fieldDisplayNamesOnCardMap,
    ]
  );
}
