/**
 * Findet oder legt die SharePoint-Dokumentablage eines Datensatzes an (Aktion „SharePoint öffnen“).
 *
 * Soll-Struktur für Chancen (Site `vonmaehlen-crm`, wie Pulse `Jobs/Crm/Opportunity/ConnectSharepoint`):
 *   Standard-Site → Bibliothek `account` → Account-Ablage `<Name>_<GUID>` → Container `opportunity`
 *   (ohne Bezug) → Chancen-Ordner `<Name> - _<GUID>`.
 * Chance ohne Account (wie Pulse): Standard-Site → Bibliothek `opportunity` → Chancen-Ordner.
 *
 * Der `opportunity`-Container wird immer unter der Eltern-Ablage genau dieses Accounts gesucht, nie global:
 * ein globaler Treffer (`relativeurl eq 'opportunity'`, `$top=1`) ist der Container eines fremden Kunden.
 *
 * Ohne React/Xrm, damit es mit node testbar bleibt (`sharepoint-location.test.mjs`); die Web-API-Aufrufe
 * liefert `useNavigation.ts` als `SharePointLocationApi`.
 */

export interface LocationQuery {
    /** Eltern-Ablage oder -Site (`_parentsiteorlocation_value`). */
    parentId?: string;
    relativeUrl?: string;
    /** `null` = Ablage ohne Bezug, undefined = egal. */
    regardingId?: string | null;
}

export interface SharePointLocationApi {
    /** Aktive Ablagen (statecode 0), zuletzt geänderte zuerst. */
    findLocationIds(query: LocationQuery): Promise<string[]>;
    /** Aktive Standard-Site (`isdefault eq true`). */
    findDefaultSiteId(): Promise<string | undefined>;
    getOpportunityAccountId(opportunityId: string): Promise<string | undefined>;
    getAccountName(accountId: string): Promise<string | undefined>;
    /** Ablage ohne Bezug (Bibliothek oder Container). */
    createLocation(input: {
        parentId: string;
        parentType: "sharepointsite" | "sharepointdocumentlocation";
        relativeUrl: string;
        name: string;
    }): Promise<string | undefined>;
    /** Ablage mit Bezug auf einen Datensatz, inkl. physischem Ordner. */
    createRegardingLocation(input: {
        parentId: string;
        entityName: string;
        recordId: string;
        folderName: string;
        recordName?: string;
    }): Promise<string | undefined>;
}

export type EnsureLocationFailure =
    | "no-default-site"
    | "no-entity-library"
    | "account-not-found"
    | "create-failed";

export type EnsureLocationResult =
    | { ok: true; locationId: string; created: boolean }
    | { ok: false; reason: EnsureLocationFailure };

const ACCOUNT_LIBRARY = "account";
const OPPORTUNITY_CONTAINER = "opportunity";

function odataString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** OData-Query für `sharepointdocumentlocation` aus einer `LocationQuery`. */
export function buildLocationQuery(query: LocationQuery): string {
    const filters = ["statecode eq 0"];
    if (query.parentId) filters.push(`_parentsiteorlocation_value eq ${query.parentId}`);
    if (query.relativeUrl !== undefined) filters.push(`relativeurl eq ${odataString(query.relativeUrl)}`);
    if (query.regardingId === null) filters.push("_regardingobjectid_value eq null");
    else if (query.regardingId) filters.push(`_regardingobjectid_value eq ${query.regardingId}`);
    return `?$select=sharepointdocumentlocationid&$filter=${filters.join(" and ")}&$orderby=modifiedon desc`;
}

function guidSuffix(id: string): string {
    return id.replace(/[{}-]/g, "").toUpperCase();
}

/**
 * Account-Ordner wie Pulse `SharepointDocumentLocationLabeler::directoryName`: `<Name>_<GUID>`,
 * ungültige Zeichen → `-`, Name auf 95 Zeichen gekürzt.
 */
export function accountDirectoryName(name: string, accountId: string): string {
    let s = name.trim().replace(/["#%&*./:<>?\\{|}~]/g, "-").replace(/\t/g, " ");
    s = Array.from(s).slice(0, 95).join("");
    return `${s}_${guidSuffix(accountId)}`;
}

/**
 * Bereinigt einen Namen für relativeurl (SharePoint/Dataverse).
 * Ungültige Zeichen: ~ " # % & * : < > ? / \ { | }
 * Darf nicht mit . enden, keine aufeinanderfolgenden Punkte, nicht .aspx/.ashx/.asmx/.svc am Ende.
 */
export function sanitizeRelativeUrlName(name: string): string {
    let s = name
        .replace(/[~"#%&*:<>?/\\{|}]/g, "-")
        .replace(/\.{2,}/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, "")
        .trim();
    const invalidSuffixes = [".aspx", ".ashx", ".asmx", ".svc"];
    for (const suffix of invalidSuffixes) {
        if (s.toLowerCase().endsWith(suffix)) s = s.slice(0, -suffix.length).replace(/-+$/, "");
    }
    return s.length > 0 ? s : "Folder";
}

/** Ordner eines Datensatzes (Chance u. a.): `<Name> - _<GUID>`. */
export function opportunityFolderName(recordName: string | undefined, recordId: string, entityName = "opportunity"): string {
    const namePart = sanitizeRelativeUrlName((recordName ?? "").trim() || entityName);
    return `${namePart} - _${guidSuffix(recordId)}`;
}

async function first(api: SharePointLocationApi, query: LocationQuery): Promise<string | undefined> {
    return (await api.findLocationIds(query))[0];
}

type Step = { ok: true; id: string } | { ok: false; reason: EnsureLocationFailure };

/** Bibliothek `<entity>` direkt an der Standard-Site – nur suchen, nie anlegen. */
async function entityLibrary(api: SharePointLocationApi, entityName: string): Promise<Step> {
    const siteId = await api.findDefaultSiteId();
    if (!siteId) return { ok: false, reason: "no-default-site" };
    const id = await first(api, { parentId: siteId, relativeUrl: entityName.toLowerCase(), regardingId: null });
    return id ? { ok: true, id } : { ok: false, reason: "no-entity-library" };
}

/** Account-Ablage; fehlt sie, wird sie wie Pulse `Account/ConnectSharepoint` angelegt. */
async function accountLocation(api: SharePointLocationApi, accountId: string): Promise<Step> {
    const existing = await first(api, { regardingId: accountId });
    if (existing) return { ok: true, id: existing };

    const accountName = await api.getAccountName(accountId);
    if (!accountName) return { ok: false, reason: "account-not-found" };

    const siteId = await api.findDefaultSiteId();
    if (!siteId) return { ok: false, reason: "no-default-site" };

    let libraryId = await first(api, { parentId: siteId, relativeUrl: ACCOUNT_LIBRARY });
    if (!libraryId) {
        libraryId = await api.createLocation({
            parentId: siteId,
            parentType: "sharepointsite",
            relativeUrl: ACCOUNT_LIBRARY,
            name: ACCOUNT_LIBRARY,
        });
        if (!libraryId) return { ok: false, reason: "create-failed" };
    }

    const folderName = accountDirectoryName(accountName, accountId);
    const id = await first(api, { parentId: libraryId, relativeUrl: folderName })
        ?? await api.createRegardingLocation({
            parentId: libraryId,
            entityName: "account",
            recordId: accountId,
            folderName,
            recordName: accountName,
        });
    return id ? { ok: true, id } : { ok: false, reason: "create-failed" };
}

/** Container `opportunity` unter genau dieser Account-Ablage; fehlt er, wird er dort angelegt. */
async function opportunityContainer(api: SharePointLocationApi, accountLocationId: string): Promise<Step> {
    const existing = await first(api, {
        parentId: accountLocationId,
        relativeUrl: OPPORTUNITY_CONTAINER,
        regardingId: null,
    });
    if (existing) return { ok: true, id: existing };
    const id = await api.createLocation({
        parentId: accountLocationId,
        parentType: "sharepointdocumentlocation",
        relativeUrl: OPPORTUNITY_CONTAINER,
        name: OPPORTUNITY_CONTAINER,
    });
    return id ? { ok: true, id } : { ok: false, reason: "create-failed" };
}

async function parentLocation(api: SharePointLocationApi, entityName: string, recordId: string): Promise<Step> {
    if (entityName.toLowerCase() !== "opportunity") return entityLibrary(api, entityName);

    const accountId = await api.getOpportunityAccountId(recordId);
    if (!accountId) return entityLibrary(api, entityName);

    const account = await accountLocation(api, accountId);
    if (!account.ok) return account;
    return opportunityContainer(api, account.id);
}

/**
 * Liefert die Ablage des Datensatzes; legt sie (und bei Chancen Account-Ablage und Container) an, wenn sie fehlt.
 */
export async function ensureRecordLocation(
    api: SharePointLocationApi,
    entityName: string,
    recordId: string,
    recordName?: string
): Promise<EnsureLocationResult> {
    const existing = await first(api, { regardingId: recordId });
    if (existing) return { ok: true, locationId: existing, created: false };

    const parent = await parentLocation(api, entityName, recordId);
    if (!parent.ok) return parent;

    const locationId = await api.createRegardingLocation({
        parentId: parent.id,
        entityName,
        recordId,
        folderName: opportunityFolderName(recordName, recordId, entityName),
        recordName,
    });
    return locationId ? { ok: true, locationId, created: true } : { ok: false, reason: "create-failed" };
}
