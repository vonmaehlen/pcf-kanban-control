// Pruefungen fuer cardValuesEqual (Wiederverwendung von Karten-Objekten nach dataset.refresh()).
// Ohne Testframework, direkt mit node (>= 23, Type Stripping fuer die .ts-Datei):
//
//   node KanbanViewControl/lib/card-equality.test.mjs
import { cardValuesEqual } from "./card-equality.ts";

let failed = 0;

function check(name, actual, expected) {
  if (actual !== expected) { failed++; console.log(`FAIL ${name}\n  ist:  ${actual}\n  soll: ${expected}`); }
  else console.log(`ok   ${name}`);
}

const card = () => ({
  id: "a1",
  column: 20,
  title: { label: "Topic", value: "Opp 1" },
  ownerid: { label: "Owner", value: { id: { guid: "u1" }, etn: "systemuser", name: "Anna" } },
  estimatedvalue: { label: "Revenue", value: "1.000,00 €" },
  estimatedvalueRaw: 1000,
  estimatedclosedateRaw: new Date(2026, 9, 8),
  statecodeOptionIdRaw: 0,
  tags: [1, 2],
  __search: "opp 1 anna 1.000,00 €",
  __values: { statecode: 0, ownerid: "u1", estimatedclosedate: new Date(2026, 9, 8), nothing: null },
});

check("identische Inhalte, neue Objekte -> gleich", cardValuesEqual(card(), card()), true);
check("gleiche Referenz -> gleich", (() => { const c = card(); return cardValuesEqual(c, c); })(), true);

const moved = card(); moved.column = 30;
check("Spalte geaendert -> ungleich", cardValuesEqual(card(), moved), false);

const renamed = card(); renamed.ownerid.value.name = "Bert";
check("Lookup-Name geaendert -> ungleich", cardValuesEqual(card(), renamed), false);

const redated = card(); redated.estimatedclosedateRaw = new Date(2026, 9, 9);
check("Datum geaendert -> ungleich", cardValuesEqual(card(), redated), false);

const rawOnly = card(); rawOnly.__values.statecode = 1;
check("nur Rohwert (__values) geaendert -> ungleich", cardValuesEqual(card(), rawOnly), false);

const extraKey = card(); extraKey.newfield = { label: "X", value: "" };
check("zusaetzliches Feld -> ungleich", cardValuesEqual(card(), extraKey), false);

const missingKey = card(); delete missingKey.tags;
check("fehlendes Feld -> ungleich", cardValuesEqual(card(), missingKey), false);

const undefVsMissing = card(); undefVsMissing.tags = undefined;
const undefOther = card(); delete undefOther.tags; undefOther.other = undefined;
check("undefined unter anderem Schluessel -> ungleich", cardValuesEqual(undefVsMissing, undefOther), false);

const arr = card(); arr.tags = [1, 3];
check("Array-Element geaendert -> ungleich", cardValuesEqual(card(), arr), false);

check("Date vs. Zahl -> ungleich", cardValuesEqual({ a: new Date(0) }, { a: 0 }), false);
check("null vs. leerer String -> ungleich", cardValuesEqual({ a: null }, { a: "" }), false);
check("NaN == NaN", cardValuesEqual({ a: NaN }, { a: NaN }), true);
check("0 vs. false -> ungleich", cardValuesEqual({ a: 0 }, { a: false }), false);

class Ref { constructor(id, name) { this.id = { guid: id }; this.name = name; this.etn = "systemuser"; } }
check("Klasseninstanz (EntityReference) gleiche Felder -> gleich", cardValuesEqual({ a: new Ref("u1", "Anna") }, { a: new Ref("u1", "Anna") }), true);
check("Klasseninstanz anderer Name -> ungleich", cardValuesEqual({ a: new Ref("u1", "Anna") }, { a: new Ref("u1", "Bert") }), false);
check("Klasseninstanz vs. Plain-Objekt -> ungleich", cardValuesEqual({ a: new Ref("u1", "Anna") }, { a: { id: { guid: "u1" }, name: "Anna", etn: "systemuser" } }), false);
class GetterOnly { get name() { return Math.random() > 2 ? "x" : "y"; } }
check("Klasseninstanz ohne eigene Felder -> ungleich (konservativ)", cardValuesEqual({ a: new GetterOnly() }, { a: new GetterOnly() }), false);

let deep = { v: 1 }; for (let i = 0; i < 10; i++) deep = { n: deep };
let deep2 = { v: 1 }; for (let i = 0; i < 10; i++) deep2 = { n: deep2 };
check("zu tiefe Verschachtelung -> ungleich (konservativ)", cardValuesEqual(deep, deep2), false);

if (failed) { console.log(`\n${failed} Pruefung(en) fehlgeschlagen`); process.exit(1); }
console.log("\nalle Pruefungen ok");
