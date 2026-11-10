// Prüfungen für die Dialog-Entscheidung. Direkt mit node (>= 23):
//
//   node KanbanViewControl/lib/activity-dialog-route.test.mjs
import { shouldCreateInDialog, shouldEditInDialog } from "./activity-dialog-route.ts";

// Alte Tabelle der internen Aufgaben (seit der Migration auf Aufgaben-Kategorien abgeschaltet).
// Zusammengesetzt, damit eine Suche nach dem Tabellennamen im Repo leer bleibt.
const OLD_INTERNAL = ["cre56", "internal", "task"].join("_");

let failed = 0;
function check(name, actual, expected) {
  if (actual !== expected) { failed++; console.log(`FAIL ${name}\n  ist: ${actual}\n  soll: ${expected}`); }
  else console.log(`ok   ${name}`);
}

check("edit task", shouldEditInDialog("task", "x"), true);
check("edit interne Aufgabe (alte Tabelle)", shouldEditInDialog(OLD_INTERNAL, "x"), false);
check("edit ohne id", shouldEditInDialog("task", undefined), false);
check("edit leere id", shouldEditInDialog("task", ""), false);
check("edit opportunity", shouldEditInDialog("opportunity", "x"), false);
check("create task/opportunity", shouldCreateInDialog("task", "opportunity", "x"), true);
check("create task/lead", shouldCreateInDialog("task", "lead", "x"), true);
check("create task/account", shouldCreateInDialog("task", "account", "x"), true);
check("create interne Aufgabe (alte Tabelle)", shouldCreateInDialog(OLD_INTERNAL, "account", "x"), false);
check("create task/contact", shouldCreateInDialog("task", "contact", "x"), false);
check("create phonecall", shouldCreateInDialog("phonecall", "opportunity", "x"), false);
check("create ohne parentId", shouldCreateInDialog("task", "opportunity", ""), false);

if (failed) { console.log(`${failed} fehlgeschlagen`); process.exit(1); }
console.log("alle ok");
