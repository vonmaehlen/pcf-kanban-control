/**
 * Spaltensumme: Wert (estimatedvalue) oder Erwartungswert (estimatedvalue x closeprobability / 100).
 *
 * Die Wahl gilt fuer alle Spalten und wird pro Browser gemerkt (localStorage). Die Wahrscheinlichkeit kommt aus den
 * Rohwerten der Karte (`__values.closeprobability`) und ist damit nur da, wenn die Ansicht die Spalte enthaelt; sie muss
 * nicht auf der Karte angezeigt werden. Ohne Wahrscheinlichkeit zaehlt eine Karte im Erwartungswert 0.
 */
import { useEffect, useState } from "react";

export type SumMode = "value" | "expected";

export const VALUE_FIELD = "estimatedvalue";
export const PROBABILITY_FIELD = "closeprobability";
const STORAGE_KEY = "kanbanViewControl.sumMode";

type CardLike = Record<string, unknown> & { __values?: Record<string, unknown> };

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Hat mindestens eine Karte einen Wert? Sonst zeigt der Spaltenkopf keine Summe. */
export const hasValue = (cards: CardLike[]): boolean => cards.some((c) => toNumber(c[`${VALUE_FIELD}Raw`]) !== null);

/** Liefert die Ansicht die Wahrscheinlichkeit mit? (Spalte in der Ansicht, auch wenn nicht auf der Karte) */
export const hasProbabilityColumn = (cards: CardLike[]): boolean =>
  cards.some((c) => c.__values != null && PROBABILITY_FIELD in c.__values);

/** Summe einer Spalte nach Modus. */
export function columnSum(cards: CardLike[], mode: SumMode): number {
  return cards.reduce((acc, c) => {
    const value = toNumber(c[`${VALUE_FIELD}Raw`]) ?? 0;
    if (mode === "value") return acc + value;
    const p = toNumber(c.__values?.[PROBABILITY_FIELD]);
    return acc + (p === null ? 0 : (value * p) / 100);
  }, 0);
}

// ── geteilter Zustand fuer alle Spaltenkoepfe (React 16.8: kein useSyncExternalStore) ──
const readStored = (): SumMode => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "expected" ? "expected" : "value";
  } catch {
    return "value";
  }
};

let current: SumMode | null = null;
const listeners = new Set<(m: SumMode) => void>();

export function getSumMode(): SumMode {
  if (current === null) current = readStored();
  return current;
}

export function setSumMode(mode: SumMode): void {
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // privates Fenster o. ae.: dann gilt die Wahl nur bis zum Neuladen
  }
  listeners.forEach((l) => l(mode));
}

export function useSumMode(): [SumMode, (m: SumMode) => void] {
  const [mode, setMode] = useState<SumMode>(getSumMode);
  useEffect(() => {
    listeners.add(setMode);
    return () => {
      listeners.delete(setMode);
    };
  }, []);
  return [mode, setSumMode];
}
