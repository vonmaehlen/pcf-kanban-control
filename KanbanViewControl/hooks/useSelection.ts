import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IInputs } from "../generated/ManifestTypes";
import { ISelectionContext } from "../context/selection-context";

const EMPTY: ReadonlySet<string> = new Set<string>();

/**
 * Zustand der Kartenauswahl.
 *
 * @param resetKey Ändert sich der Schlüssel (Dataset neu geladen, Filter oder Suche geändert),
 *   wird die Auswahl aufgehoben – sonst blieben unsichtbare Karten markiert und ein Befehl
 *   griffe auf Datensätze, die man gar nicht sieht.
 */
export function useSelection(
  context: ComponentFramework.Context<IInputs>,
  enabled: boolean,
  resetKey: string
): ISelectionContext {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(EMPTY);
  const datasetRef = useRef(context.parameters.dataset);
  datasetRef.current = context.parameters.dataset;
  // Erst melden, wenn der Nutzer etwas ausgewählt hat – sonst würde schon das erste Rendern
  // eine Auswahl der Plattform überschreiben.
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!reportedRef.current && selectedIds.size === 0) return;
    reportedRef.current = true;
    try {
      datasetRef.current.setSelectedRecordIds([...selectedIds]);
    } catch (e) {
      console.warn("KanbanViewControl: setSelectedRecordIds fehlgeschlagen", e);
    }
  }, [enabled, selectedIds]);

  useEffect(() => {
    setSelectedIds((prev) => (prev.size ? EMPTY : prev));
  }, [resetKey]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(EMPTY), []);

  return useMemo(
    () => ({ enabled, selectedIds: enabled ? selectedIds : EMPTY, toggle, clear }),
    [enabled, selectedIds, toggle, clear]
  );
}
