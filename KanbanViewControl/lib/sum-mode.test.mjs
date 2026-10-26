// Pruefungen fuer die Spaltensumme Wert / Erwartungswert. Ohne Testframework, direkt mit node (>= 23,
// Type Stripping fuer die .ts-Datei):
//
//   node KanbanViewControl/lib/sum-mode.test.mjs
import { columnSum, hasProbabilityColumn, hasValue } from "./sum-mode.ts";

let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${name}\n  ist:  ${a}\n  soll: ${e}`); }
  else console.log(`ok   ${name}`);
}

const cards = [
  { estimatedvalueRaw: 1000, __values: { closeprobability: 50 } },
  { estimatedvalueRaw: 200, __values: { closeprobability: 10 } },
  { estimatedvalueRaw: 300, __values: { closeprobability: null } },
  { __values: { closeprobability: 80 } },
];

check("Wert: Summe der Werte", columnSum(cards, "value"), 1500);
check("Erwartungswert: Wert x Wkt, ohne Wkt 0", columnSum(cards, "expected"), 520);
check("hasValue", [hasValue(cards), hasValue([{ __values: {} }])], [true, false]);
check("hasProbabilityColumn: Spalte in der Ansicht", [hasProbabilityColumn(cards), hasProbabilityColumn([{ estimatedvalueRaw: 1, __values: {} }])],
  [true, false]);
check("Wkt als Text", columnSum([{ estimatedvalueRaw: "100", __values: { closeprobability: "25" } }], "expected"), 25);

if (failed) { console.log(`\n${failed} fehlgeschlagen`); process.exit(1); }
console.log("\nalle Pruefungen bestanden");
