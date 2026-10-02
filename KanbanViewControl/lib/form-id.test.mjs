// Pruefungen fuer card.openForm.formIdByField. Ohne Testframework, direkt mit node (>= 23,
// Type Stripping fuer die .ts-Datei):
//
//   node KanbanViewControl/lib/form-id.test.mjs
import { formIdKey, parseFormIdByField, resolveFormId } from "./form-id.ts";

let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${name}\n  ist:  ${a}\n  soll: ${e}`); }
  else console.log(`ok   ${name}`);
}

const CB = "aaaaaaaa-0000-0000-0000-000000000001";
const RETAIL = "bbbbbbbb-0000-0000-0000-000000000002";

const config = parseFormIdByField({
  field: " cre56_type ",
  map: { "1": "{AAAAAAAA-0000-0000-0000-000000000001}", "2": RETAIL, "3": RETAIL, "4": "kein-guid" },
});

check("parse: Feld getrimmt, IDs normalisiert, ungueltige verworfen", config, {
  field: "cre56_type",
  map: { "1": CB, "2": RETAIL, "3": RETAIL },
});
check("parse: ohne Feld -> undefined", parseFormIdByField({ map: { "1": CB } }), undefined);
check("parse: ohne gueltige ID -> undefined", parseFormIdByField({ field: "x", map: { "1": "nope" } }), undefined);
check("parse: kein Objekt -> undefined", parseFormIdByField("cre56_type"), undefined);
check("parse: nur default", parseFormIdByField({ field: "x", default: RETAIL }), { field: "x", map: {}, default: RETAIL });

check("key: Zahl", formIdKey(2), "2");
check("key: Text", formIdKey(" 2 "), "2");
check("key: Boolean", formIdKey(true), "true");
check("key: Lookup PCF", formIdKey({ id: { guid: "{CCCCCCCC-0000-0000-0000-000000000003}" }, name: "x" }), "cccccccc-0000-0000-0000-000000000003");
check("key: Lookup id", formIdKey({ id: "CCCCCCCC-0000-0000-0000-000000000003" }), "cccccccc-0000-0000-0000-000000000003");
check("key: leer", formIdKey(""), undefined);
check("key: null", formIdKey(null), undefined);

check("resolve: Co-Branding", resolveFormId(config, 1), CB);
check("resolve: Retail als Text", resolveFormId(config, "2"), RETAIL);
check("resolve: RTA", resolveFormId(config, 3), RETAIL);
check("resolve: unbekannt ohne default", resolveFormId(config, 9), undefined);
check("resolve: leer ohne default", resolveFormId(config, null), undefined);
check("resolve: ohne Config", resolveFormId(undefined, 1), undefined);

const withDefault = parseFormIdByField({ field: "cre56_type", map: { "1": CB }, default: RETAIL });
check("resolve: default bei fehlendem Wert", resolveFormId(withDefault, null), RETAIL);
check("resolve: default bei unbekanntem Wert", resolveFormId(withDefault, 2), RETAIL);
check("resolve: Treffer schlaegt default", resolveFormId(withDefault, 1), CB);

console.log(failed === 0 ? "\nALLE PRÜFUNGEN BESTANDEN" : `\n${failed} PRÜFUNG(EN) FEHLGESCHLAGEN`);
process.exit(failed === 0 ? 0 : 1);
