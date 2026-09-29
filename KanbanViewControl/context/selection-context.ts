import { createContext } from "react";

/**
 * Kartenauswahl (card.selection.enabled). Die Auswahl wird per dataset.setSelectedRecordIds an
 * Dynamics gemeldet, damit Befehle der Ansicht (SelectedControlSelectedItemIds, Anzeigeregeln
 * nach Auswahlanzahl) dieselben Datensätze sehen wie im Standard-Grid.
 *
 * Eigener Context statt CardActionsContext: Die Auswahl wechselt bei jedem Klick, die
 * Karten-Aktionen sollen dagegen stabil bleiben.
 */
export interface ISelectionContext {
  enabled: boolean;
  selectedIds: ReadonlySet<string>;
  toggle: (id: string) => void;
  clear: () => void;
}

export const SelectionContext = createContext<ISelectionContext>({
  enabled: false,
  selectedIds: new Set<string>(),
  toggle: () => undefined,
  clear: () => undefined,
});

/** Strg-/Cmd-Klick schaltet die Auswahl um, statt den Datensatz zu öffnen. */
export function isSelectionClick(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey;
}
