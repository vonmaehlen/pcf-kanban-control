/**
 * Öffnet den Aktivitätsdialog (Webressource cre56_/activitydialog/index.html) als Popup.
 * Kopie, Quelle: crm-activity-dialog/client/openActivityDialog.ts (auch in pcf-task-board, pcf-email-view) – bei Änderungen alle nachziehen.
 * Löst nach dem Schließen auf; result = null, wenn nichts gespeichert wurde oder das Ergebnis fehlt.
 * Fehlt die Webressource oder schlägt navigateTo fehl, wirft die Funktion – der Aufrufer fällt auf das CRM-Formular zurück.
 */
export interface ActivityDialogArgs {
    mode: "create" | "edit";
    entity: "task" | "cre56_internal_task";
    id?: string;
    regarding?: { entity: "opportunity" | "lead" | "account"; id: string; name: string };
    defaults?: { due?: string; ownerId?: string; statuscode?: number; subject?: string };
}
export interface ActivityDialogResult { saved: boolean; completed: boolean; deleted: boolean; id: string | null; }

export const DIALOG_ENTITIES = ["task", "cre56_internal_task"];

/** Titel im CRM-Rahmen; gleiche Texte wie dialogTitle in crm-activity-dialog/src/logic/ui.ts. */
export function dialogTitle(args: ActivityDialogArgs): string {
    const intern = args.entity === "cre56_internal_task";
    if (args.mode === "create") return intern ? "Neue interne Aufgabe" : "Neue Aufgabe";
    return intern ? "Interne Aufgabe" : "Aufgabe";
}

export async function openActivityDialog(args: ActivityDialogArgs): Promise<ActivityDialogResult | null> {
    const xrm = (window as any).Xrm;
    if (!xrm?.Navigation?.navigateTo) throw new Error("Xrm.Navigation fehlt");
    const resultKey = `vm-activity-dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await xrm.Navigation.navigateTo(
        { pageType: "webresource", webresourceName: "cre56_/activitydialog/index.html", data: JSON.stringify({ ...args, resultKey }) },
        { target: 2, position: 1, width: { value: 640, unit: "px" }, height: { value: 85, unit: "%" }, title: dialogTitle(args) });
    try {
        const raw = window.sessionStorage.getItem(resultKey);
        window.sessionStorage.removeItem(resultKey);
        return raw ? (JSON.parse(raw) as ActivityDialogResult) : null;
    } catch {
        return null;
    }
}
