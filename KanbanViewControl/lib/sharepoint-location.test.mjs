// Prüfungen für die SharePoint-Ablage der Aktion „SharePoint öffnen“. Direkt mit node (>= 23):
//
//   node KanbanViewControl/lib/sharepoint-location.test.mjs
//
// Ein In-Memory-CRM spielt die Ablagen nach. Jede Suche wird protokolliert, damit sich prüfen lässt,
// dass der `opportunity`-Container nie ohne Eltern-Filter gesucht wird.
import {
  accountDirectoryName,
  buildLocationQuery,
  ensureRecordLocation,
  opportunityFolderName,
} from "./sharepoint-location.ts";

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${name}\n  ist:  ${a}\n  soll: ${e}`); }
  else console.log(`ok   ${name}`);
}

const SITE = "site-default";
const ACC_A = "aaaaaaaa-0000-0000-0000-00000000000a"; // hat Ablage + Container
const ACC_B = "bbbbbbbb-0000-0000-0000-00000000000b"; // hat keine Ablage
const ACC_C = "cccccccc-0000-0000-0000-00000000000c"; // hat Ablage, aber keinen Container
const ACC_SAMMEL = "dddddddd-0000-0000-0000-00000000000d"; // fremder „Sammel-Account“
const OPP = "12345678-1234-1234-1234-123456789abc";

function fakeCrm({ opportunityAccount, withDefaultSite = true }) {
  let seq = 0;
  const locations = [
    // Bibliotheken direkt an der Site
    { id: "lib-account", parentId: SITE, relativeUrl: "account", regardingId: null },
    { id: "lib-opportunity", parentId: SITE, relativeUrl: "opportunity", regardingId: null },
    // Fremder Account mit Container – genau der wurde früher fälschlich genommen
    { id: "loc-sammel", parentId: "lib-account", relativeUrl: "Sammel_D", regardingId: ACC_SAMMEL },
    { id: "cont-sammel", parentId: "loc-sammel", relativeUrl: "opportunity", regardingId: null },
    // Account A: Ablage + Container
    { id: "loc-a", parentId: "lib-account", relativeUrl: "Kunde A_A", regardingId: ACC_A },
    { id: "cont-a", parentId: "loc-a", relativeUrl: "opportunity", regardingId: null },
    // Account C: Ablage ohne Container
    { id: "loc-c", parentId: "lib-account", relativeUrl: "Kunde C_C", regardingId: ACC_C },
  ];
  const accounts = { [ACC_A]: "Kunde A", [ACC_B]: "Kunde B. GmbH & Co", [ACC_C]: "Kunde C", [ACC_SAMMEL]: "Sammel" };
  const queries = [];
  const created = [];

  const matches = (loc, q) =>
    (q.parentId === undefined || loc.parentId === q.parentId) &&
    (q.relativeUrl === undefined || loc.relativeUrl === q.relativeUrl) &&
    (q.regardingId === undefined || loc.regardingId === q.regardingId);

  const api = {
    async findLocationIds(q) {
      queries.push(q);
      return locations.filter((l) => matches(l, q)).map((l) => l.id);
    },
    async findDefaultSiteId() { return withDefaultSite ? SITE : undefined; },
    async getOpportunityAccountId() { return opportunityAccount; },
    async getAccountName(id) { return accounts[id]; },
    async createLocation(input) {
      const id = `new-${++seq}`;
      locations.push({ id, parentId: input.parentId, relativeUrl: input.relativeUrl, regardingId: null });
      created.push({ kind: "container", ...input });
      return id;
    },
    async createRegardingLocation(input) {
      const id = `new-${++seq}`;
      locations.push({ id, parentId: input.parentId, relativeUrl: input.folderName, regardingId: input.recordId });
      created.push({ kind: "regarding", ...input });
      return id;
    },
  };
  const parentOf = (id) => locations.find((l) => l.id === id)?.parentId;
  const pathOf = (id) => {
    const parts = [];
    for (let cur = id; cur && cur !== SITE; cur = parentOf(cur)) parts.unshift(locations.find((l) => l.id === cur).relativeUrl);
    return parts.join("/");
  };
  return { api, queries, created, pathOf };
}

const oppFolder = opportunityFolderName("Messe Herbst", OPP);
check("Chancen-Ordner: <Name> - _<GUID>", oppFolder, "Messe Herbst - _12345678123412341234123456789ABC");

// Kein globales Suchen nach dem Container: jede Suche nach relativeurl 'opportunity' braucht eine Eltern-Ablage.
function noGlobalContainerLookup(name, queries) {
  check(`${name}: Container nie global gesucht`,
    queries.filter((q) => q.relativeUrl === "opportunity" && !q.parentId).length, 0);
}

{
  const crm = fakeCrm({ opportunityAccount: ACC_A });
  const res = await ensureRecordLocation(crm.api, "opportunity", OPP, "Messe Herbst");
  check("Account mit Ablage: ok", res.ok, true);
  check("Account mit Ablage: Ordner unter eigenem Container",
    crm.pathOf(res.locationId), "account/Kunde A_A/opportunity/" + oppFolder);
  check("Account mit Ablage: nur der Chancen-Ordner angelegt",
    crm.created.map((c) => c.kind + ":" + c.parentId), ["regarding:cont-a"]);
  noGlobalContainerLookup("Account mit Ablage", crm.queries);
}

{
  const crm = fakeCrm({ opportunityAccount: ACC_B });
  const res = await ensureRecordLocation(crm.api, "opportunity", OPP, "Messe Herbst");
  const accDir = accountDirectoryName("Kunde B. GmbH & Co", ACC_B);
  check("Account ohne Ablage: ok", res.ok, true);
  check("Account ohne Ablage: Account-Ordner nach Pulse-Schema", accDir, "Kunde B- GmbH - Co_BBBBBBBB00000000000000000000000B");
  check("Account ohne Ablage: Ordner unter neu angelegtem Account",
    crm.pathOf(res.locationId), `account/${accDir}/opportunity/${oppFolder}`);
  check("Account ohne Ablage: angelegt in der Reihenfolge Account → Container → Chance",
    crm.created.map((c) => `${c.kind}:${c.relativeUrl ?? c.folderName}`),
    [`regarding:${accDir}`, "container:opportunity", `regarding:${oppFolder}`]);
  check("Account ohne Ablage: Account-Ablage bezieht sich auf den Account",
    crm.created[0].entityName + ":" + crm.created[0].recordId + ":" + crm.created[0].parentId, `account:${ACC_B}:lib-account`);
  check("Account ohne Ablage: nichts beim Sammel-Account", crm.pathOf(res.locationId).includes("Sammel"), false);
  noGlobalContainerLookup("Account ohne Ablage", crm.queries);
}

{
  const crm = fakeCrm({ opportunityAccount: ACC_C });
  const res = await ensureRecordLocation(crm.api, "opportunity", OPP, "Messe Herbst");
  check("Account mit Ablage ohne Container: ok", res.ok, true);
  check("Account mit Ablage ohne Container: Container unter genau diesem Account",
    crm.created.map((c) => `${c.kind}:${c.parentId}:${c.relativeUrl ?? c.folderName}`),
    ["container:loc-c:opportunity", `regarding:new-1:${oppFolder}`]);
  check("Account mit Ablage ohne Container: Pfad",
    crm.pathOf(res.locationId), "account/Kunde C_C/opportunity/" + oppFolder);
  noGlobalContainerLookup("Account ohne Container", crm.queries);
}

{
  const crm = fakeCrm({ opportunityAccount: undefined });
  const res = await ensureRecordLocation(crm.api, "opportunity", OPP, "Messe Herbst");
  check("Chance ohne Account: ok", res.ok, true);
  check("Chance ohne Account: Bibliothek opportunity an der Site (wie Pulse)",
    crm.pathOf(res.locationId), "opportunity/" + oppFolder);
  check("Chance ohne Account: kein Account-Ordner angelegt",
    crm.created.map((c) => c.kind + ":" + c.parentId), ["regarding:lib-opportunity"]);
  noGlobalContainerLookup("Chance ohne Account", crm.queries);
}

{
  const crm = fakeCrm({ opportunityAccount: undefined, withDefaultSite: false });
  const res = await ensureRecordLocation(crm.api, "opportunity", OPP, "Messe Herbst");
  check("Ohne Standard-Site: klare Absage statt fremdem Ordner", [res.ok, res.reason], [false, "no-default-site"]);
  check("Ohne Standard-Site: nichts angelegt", crm.created.length, 0);
}

{
  const crm = fakeCrm({ opportunityAccount: ACC_A });
  // Chance hat schon eine eigene Ablage → wird genommen, nichts angelegt
  await crm.api.createRegardingLocation({ parentId: "cont-a", entityName: "opportunity", recordId: OPP, folderName: "alt", recordName: "alt" });
  crm.created.length = 0;
  const res = await ensureRecordLocation(crm.api, "opportunity", OPP, "Messe Herbst");
  check("Bestehende Ablage der Chance: wiederverwendet", [res.ok, res.created, crm.created.length], [true, false, 0]);
}

check("OData: Container mit Eltern-Filter",
  buildLocationQuery({ parentId: "p1", relativeUrl: "opportunity", regardingId: null }),
  "?$select=sharepointdocumentlocationid&$filter=statecode eq 0 and _parentsiteorlocation_value eq p1" +
  " and relativeurl eq 'opportunity' and _regardingobjectid_value eq null&$orderby=modifiedon desc");
check("OData: Hochkomma maskiert",
  buildLocationQuery({ parentId: "p1", relativeUrl: "O'Neil" }),
  "?$select=sharepointdocumentlocationid&$filter=statecode eq 0 and _parentsiteorlocation_value eq p1" +
  " and relativeurl eq 'O''Neil'&$orderby=modifiedon desc");

if (failed) { console.log(`\n${failed} fehlgeschlagen`); process.exit(1); }
console.log("\nalle ok");
