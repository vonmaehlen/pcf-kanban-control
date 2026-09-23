/**
 * Loest einen Punkt-Pfad wie "MyNamespace.Kanban.onBeforeMove" gegen `window` auf.
 * `owner` ist das Objekt, auf dem die Funktion liegt, damit sie mit korrektem `this`
 * aufgerufen werden kann (Klassen-Instanzen aus Web Resources).
 */
export function resolveGlobalFunction<TArgs, TResult>(
  functionPath: string | undefined
): { fn: (args: TArgs) => TResult; owner: unknown } | undefined {
  if (!functionPath) return undefined;
  const path = functionPath.split(".").map((p) => p.trim()).filter(Boolean);
  if (path.length === 0) return undefined;
  let owner: any = undefined;
  let current: any = window as any;
  for (const part of path) {
    if (current == null) return undefined;
    owner = current;
    current = current[part];
  }
  if (typeof current !== "function") return undefined;
  return { fn: current as (args: TArgs) => TResult, owner: path.length === 1 ? undefined : owner };
}
