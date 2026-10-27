// Pruefungen fuer die Meldung nicht angewendeter Preset-Felder. Ohne Testframework, direkt mit node (>= 23,
// Type Stripping fuer die .ts-Datei):
//
//   node KanbanViewControl/lib/preset-fields.test.mjs
import { unappliedPresetFields, unappliedPresetFieldsMessage } from "./preset-fields.ts";

let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${name}\n  ist:  ${a}\n  soll: ${e}`); }
  else console.log(`ok   ${name}`);
}

const keys = ["ownerid", "a_c66.ownerid", "cre56_statusfruhsteaktivitatenfalligkeit"];

check("alle Felder sind Quick Filter",
  unappliedPresetFields([{ label: "Meine", filters: { ownerid: "{{currentUser}}", "a_c66.ownerid": "" } }], keys), []);
check("Phase ohne Quick Filter wird gemeldet",
  unappliedPresetFields([{ label: "Fokus", filters: { cre56_statusfruhsteaktivitatenfalligkeit: ["x"], cre56_cb_opportunity_stage: "lt:60" } }], keys),
  [{ preset: "Fokus", field: "cre56_cb_opportunity_stage" }]);
check("Alias-Feld im Preset ohne passenden Quick Filter",
  unappliedPresetFields([{ label: "Todos", filters: { "a_999.ownerid": "x" } }], ["statecode"]),
  [{ preset: "Todos", field: "a_999.ownerid" }]);
check("letzter Namensteil eines Alias-Keys zaehlt (wie applyFilterPreset)",
  unappliedPresetFields([{ label: "Owner", filters: { ownerid: "x" } }], ["a_c66.ownerid"]), []);
check("leere Filter (Trennzeichen-Preset)",
  unappliedPresetFields([{ label: "____", filters: {} }], keys), []);
check("keine Meldung ohne Treffer", unappliedPresetFieldsMessage([]), null);
check("Meldung nennt Feld und Preset",
  unappliedPresetFieldsMessage([{ preset: "Fokus", field: "cre56_cb_opportunity_stage" }]).startsWith(
    'Ignored preset filter(s): "cre56_cb_opportunity_stage" in "Fokus".'), true);

if (failed) { console.log(`${failed} fehlgeschlagen`); process.exit(1); }
console.log("alle ok");
