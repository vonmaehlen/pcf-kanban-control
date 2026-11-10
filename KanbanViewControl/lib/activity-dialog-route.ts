/**
 * Entscheidung, ob ein Öffnen/Anlegen über den Aktivitätsdialog läuft (sonst CRM-Formular).
 * Bewusst ohne Imports: wird von lib/activity-dialog-route.test.mjs direkt mit node geprüft.
 */
export const DIALOG_TABLES = ["task"] as const;
export const DIALOG_REGARDING_TABLES = ["opportunity", "lead", "account"] as const;

export type DialogTable = (typeof DIALOG_TABLES)[number];
export type DialogRegardingTable = (typeof DIALOG_REGARDING_TABLES)[number];

export function isDialogTable(entityName: string | undefined | null): entityName is DialogTable {
  return !!entityName && (DIALOG_TABLES as readonly string[]).indexOf(entityName) >= 0;
}

/** Bearbeiten: nur Dialog-Tabellen mit Datensatz-Id. */
export function shouldEditInDialog(entityName: string, id?: string): boolean {
  return isDialogTable(entityName) && !!id;
}

/** Anlegen: Dialog-Tabelle und Bezug auf Verkaufschance, Lead oder Konto mit Id. */
export function shouldCreateInDialog(activityEntityName: string, parentEntityName: string, parentId: string): boolean {
  return (
    isDialogTable(activityEntityName) &&
    (DIALOG_REGARDING_TABLES as readonly string[]).indexOf(parentEntityName) >= 0 &&
    !!parentId
  );
}
