import * as React from "react";

/** Highlight-Position auf der Karte: linker/rechter Rand oder diagonale Ecke. */
export type HighlightType =
  | "left"
  | "right"
  | "cornerTopRight"
  | "cornerBottomRight"
  | "cornerTopLeft"
  | "cornerBottomLeft";

export interface BooleanFieldHighlightConfig {
  logicalName: string;
  color: string;
  /** Highlight-Typ: linker/rechter Rand oder diagonale Ecke. Default "left". Erster Treffer pro Typ gewinnt. */
  type?: HighlightType;
}

/**
 * Regel fuer den Kartenhintergrund nach Feldwert. Genau eine Bedingung pro Regel:
 * - `optionValue`: numerische Option-ID(s) einer Choice/Status/Boolean-Spalte (sprachunabhaengig)
 * - `value`: Textvergleich auf dem formatierten Wert (case-insensitiv), fuer Nicht-Choice-Felder
 * Die erste zutreffende Regel gewinnt.
 */
export interface CardBackgroundColorConfig {
  logicalName: string;
  color: string;
  optionValue?: number[];
  value?: string;
}

export interface FieldWidthConfig {
  logicalName: string;
  width: number;
}

/**
 * Gebündelte, einmal geparste Karten-Konfiguration (aus den Komponenten-Properties).
 * Wird zentral in App.tsx via useCardConfig() erzeugt und über den Context an alle
 * Karten verteilt, damit die JSON-Parsings nicht pro Karte wiederholt werden.
 */
export interface CardConfig {
  hideColumnFieldOnCard: boolean;
  hiddenFieldsOnCardSet: Set<string>;
  fieldsVisiblePerStageMap: Map<string, string[]>;
  /** Feld -> Spalten/Stages, in denen es NICHT angezeigt wird (Gegenstueck zur Whitelist). */
  fieldsHiddenPerStageMap: Map<string, string[]>;
  htmlFieldsOnCardSet: Set<string>;
  hideLabelForFieldsOnCardSet: Set<string>;
  booleanFieldHighlights: BooleanFieldHighlightConfig[];
  cardBackgroundColors: CardBackgroundColorConfig[];
  fieldWidthsOnCardMap: Map<string, number>;
  lookupFieldsAsPersonaOnCardSet: Set<string>;
  lookupFieldsPersonaIconOnlyOnCardSet: Set<string>;
  showEmailAndPhoneAsLinks: boolean;
  ellipsisFieldsOnCardSet: Set<string>;
  lineBreakFieldsOnCardSet: Set<string>;
  fieldMaxHeightOnCardMap: Map<string, number>;
  fieldDisplayNamesOnCardMap: Map<string, string>;
}

/** Leere Default-Konfiguration (keine Sonderbehandlung für Felder). */
export const emptyCardConfig: CardConfig = {
  hideColumnFieldOnCard: false,
  hiddenFieldsOnCardSet: new Set(),
  fieldsVisiblePerStageMap: new Map(),
  fieldsHiddenPerStageMap: new Map(),
  htmlFieldsOnCardSet: new Set(),
  hideLabelForFieldsOnCardSet: new Set(),
  booleanFieldHighlights: [],
  cardBackgroundColors: [],
  fieldWidthsOnCardMap: new Map(),
  lookupFieldsAsPersonaOnCardSet: new Set(),
  lookupFieldsPersonaIconOnlyOnCardSet: new Set(),
  showEmailAndPhoneAsLinks: false,
  ellipsisFieldsOnCardSet: new Set(),
  lineBreakFieldsOnCardSet: new Set(),
  fieldMaxHeightOnCardMap: new Map(),
  fieldDisplayNamesOnCardMap: new Map(),
};

export const CardConfigContext = React.createContext<CardConfig>(emptyCardConfig);
