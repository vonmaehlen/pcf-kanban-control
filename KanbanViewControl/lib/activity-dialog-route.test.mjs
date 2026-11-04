// Prüfungen für die Dialog-Entscheidung. Direkt mit node (>= 23):
//
//   node KanbanViewControl/lib/activity-dialog-route.test.mjs
import { shouldCreateInDialog, shouldEditInDialog } from "./activity-dialog-route.ts";

let failed = 0;
function check(name, actual, expected) {
  if (actual !== expected) { failed++; console.log(`FAIL ${name}\n  ist: ${actual}\n  soll: ${expected}`); }
  else console.log(`ok   ${name}`);
}

check("edit task", shouldEditInDialog("task", "x"), true);
check("edit internal task", shouldEditInDialog("cre56_internal_task", "x"), true);
check("edit ohne id", shouldEditInDialog("task", undefined), false);
check("edit leere id", shouldEditInDialog("task", ""), false);
check("edit opportunity", shouldEditInDialog("opportunity", "x"), false);
check("create task/opportunity", shouldCreateInDialog("task", "opportunity", "x"), true);
check("create task/lead", shouldCreateInDialog("task", "lead", "x"), true);
check("create internal/account", shouldCreateInDialog("cre56_internal_task", "account", "x"), true);
check("create task/contact", shouldCreateInDialog("task", "contact", "x"), false);
check("create phonecall", shouldCreateInDialog("phonecall", "opportunity", "x"), false);
check("create ohne parentId", shouldCreateInDialog("task", "opportunity", ""), false);

if (failed) { console.log(`${failed} fehlgeschlagen`); process.exit(1); }
console.log("alle ok");
