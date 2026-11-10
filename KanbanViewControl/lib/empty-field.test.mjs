// Pruefungen fuer isCardFieldOmitted (leere Kartenfelder ausblenden, card.fields.<feld>.hideWhenEmpty).
// Ohne Testframework, direkt mit node (>= 23, Type Stripping fuer die .ts-Datei):
//
//   node KanbanViewControl/lib/empty-field.test.mjs
import { isCardFieldValueEmpty, isCardFieldOmitted } from "./empty-field.ts";

let failed = 0;

function check(name, actual, expected) {
  if (actual !== expected) { failed++; console.log(`FAIL ${name}\n  ist:  ${actual}\n  soll: ${expected}`); }
  else console.log(`ok   ${name}`);
}

const lookup = { id: { guid: "t1" }, etn: "task", name: "Muster nachschicken" };

check("leer: null", isCardFieldValueEmpty(null), true);
check("leer: undefined", isCardFieldValueEmpty(undefined), true);
check("leer: Leerstring", isCardFieldValueEmpty(""), true);
check("leer: Unallocated", isCardFieldValueEmpty("Unallocated"), true);
check("nicht leer: Text", isCardFieldValueEmpty("12.11.2026"), false);
check("nicht leer: Lookup", isCardFieldValueEmpty(lookup), false);

// Bisheriges Verhalten: leeres Feld mit Beschriftung zeigt „-“, ohne Beschriftung entfaellt es.
check("leer, mit Label, ohne hideWhenEmpty -> sichtbar", isCardFieldOmitted(null, { hasLabel: true, hideWhenEmpty: false }), false);
check("leer, ohne Label -> entfaellt", isCardFieldOmitted(null, { hasLabel: false, hideWhenEmpty: false }), true);
// Neu: hideWhenEmpty blendet das leere Feld auch mit Beschriftung aus.
check("leer, mit Label, hideWhenEmpty -> entfaellt", isCardFieldOmitted(null, { hasLabel: true, hideWhenEmpty: true }), true);
check("Lookup gefuellt, hideWhenEmpty -> sichtbar", isCardFieldOmitted(lookup, { hasLabel: true, hideWhenEmpty: true }), false);
check("Datum gefuellt, hideWhenEmpty -> sichtbar", isCardFieldOmitted("12.11.2026", { hasLabel: true, hideWhenEmpty: true }), false);

if (failed) { console.log(`\n${failed} fehlgeschlagen`); process.exit(1); }
console.log("\nalle ok");
