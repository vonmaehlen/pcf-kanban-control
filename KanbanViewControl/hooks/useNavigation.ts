import { useCallback, useMemo } from "react";
import { IInputs } from "../generated/ManifestTypes";
import { isNullOrEmpty } from "../lib/utils";
import { openActivityDialog } from "../lib/activityDialog";
import { isDialogTable, shouldCreateInDialog } from "../lib/activity-dialog-route";
import { buildLocationQuery, ensureRecordLocation, SharePointLocationApi } from "../lib/sharepoint-location";
import { getLocaleFromLanguageId, getStrings } from "../lib/strings";
import toast from "react-hot-toast";

const popupOtions = {
    height: {value: 85, unit:"%"},
    width: {value: 90, unit:"%"}, 
    target: 2,  
    position: 1
}

function getClientUrl(): string {
    const w = typeof window !== "undefined" ? window : undefined;
    const xrm = (w as { Xrm?: { Utility?: { getGlobalContext?: () => { getClientUrl?: () => string } } } })?.Xrm;
    const url = xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.();
    if (url) return url.replace(/\/$/, "");
    if (w?.location?.origin) return w.location.origin;
    return "";
}

/**
 * Holt die Basis-URL der Parent-Location (wie Modern-Dropzone-PCF).
 * @see https://github.com/GorgonUK/Modern-Dropzone-PCF/blob/main/Dropzone/DataverseActions.tsx
 */
async function fetchSiteUrl(
    clientUrl: string,
    parentLocationId: string,
    entityName: string,
    recordId: string
): Promise<string> {
    const url = `${clientUrl.replace(/\/$/, "")}/api/data/v9.0/FetchSiteUrl`;
    const body = JSON.stringify({
        DocumentId: parentLocationId,
        ParentEntityReference: {
            "@odata.type": `Microsoft.Dynamics.CRM.${entityName}`,
            [`${entityName}id`]: recordId,
        },
    });
    const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
    });
    if (!res.ok) throw new Error(`FetchSiteUrl failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const siteUrl = data?.SiteAndLocationUrl;
    if (!siteUrl) throw new Error("SiteAndLocationUrl not found in FetchSiteUrl response");
    return siteUrl;
}

/**
 * Erstellt eine SharePoint-Location (und physischen Ordner) per AddOrEditLocation (wie Dynamics-UI).
 * @see https://github.com/GorgonUK/Modern-Dropzone-PCF/blob/main/Dropzone/DataverseActions.tsx
 */
async function addOrEditLocation(
    clientUrl: string,
    parentLocationId: string,
    entityName: string,
    recordId: string,
    locationName: string
): Promise<string> {
    const siteUrl = await fetchSiteUrl(clientUrl, parentLocationId, entityName, recordId);
    const absUrl = siteUrl.replace(/\/$/, "") + "/" + locationName;
    const url = `${clientUrl.replace(/\/$/, "")}/api/data/v9.0/AddOrEditLocation`;
    const body = JSON.stringify({
        AbsUrl: absUrl,
        DocumentId: "",
        IsAddOrEditMode: true,
        IsCreateFolder: true,
        LocationName: locationName,
        ParentEntityReference: {
            "@odata.type": `Microsoft.Dynamics.CRM.${entityName}`,
            [`${entityName}id`]: recordId,
        },
        ParentId: parentLocationId,
        ParentType: "sharepointdocumentlocation",
        RelativePath: locationName,
    });
    const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
            Accept: "application/json",
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AddOrEditLocation failed: ${res.status} ${res.statusText} ${text}`);
    }
    const data = await res.json();
    const locationId = data?.LocationId;
    if (!locationId) throw new Error("LocationId not found in AddOrEditLocation response");
    return locationId;
}

/**
 * Versucht, den SharePoint-Ordner per REST anzulegen (nur bei createRecord-Fallback).
 * Von Dynamics-Origin zu SharePoint wird der Aufruf per CORS blockiert – das ist erwartbar.
 * Nach AddOrEditLocation wird diese Funktion nicht aufgerufen (Ordner ist bereits serverseitig angelegt).
 */
async function ensureSharePointFolderExists(absoluteUrl: string): Promise<void> {
    if (typeof fetch === "undefined") return;
    try {
        const url = new URL(absoluteUrl);
        const pathname = url.pathname;
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length < 2) return;
        const siteRelativePath = "/" + segments.slice(0, 2).join("/");
        const siteRoot = url.origin + siteRelativePath;
        const apiUrl = siteRoot + "/_api/web/folders";

        for (let i = 2; i <= segments.length; i++) {
            const relativePath = "/" + segments.slice(0, i).join("/");
            const res = await fetch(apiUrl, {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json;odata=verbose",
                    "Content-Type": "application/json;odata=verbose",
                    ODataVersion: "4.0",
                },
                body: JSON.stringify({
                    __metadata: { type: "SP.Folder" },
                    ServerRelativeUrl: relativePath,
                }),
            });
            if (!res.ok && res.status !== 409) {
                const text = await res.text();
                console.warn("[Kanban SharePoint] Folder ensure failed", res.status, relativePath, text);
                break;
            }
        }
    } catch (e) {
        console.warn("[Kanban SharePoint] ensureSharePointFolderExists", e);
    }
}

export const useNavigation = (context: ComponentFramework.Context<IInputs>) => {
    const { dataset } = context.parameters;

    const openForm = useCallback(async (entityName: string, id?: string, formId?: string): Promise<void> => {
        const pageInput = {
            entityName: entityName,
            entityId: id,
            pageType: "entityrecord",
            ...(formId ? { formId } : {}),
        }

        //@ts-expect-error - Method does not exist in PCF SDK however it should be use to maintain control state alive
        await context.navigation.navigateTo(pageInput, popupOtions);
    }, [context]);

    /** Opens the entity record in a new browser tab (_blank). */
    const openEntityInNewTab = useCallback((entityName: string, id: string, formId?: string): void => {
        const baseUrl = getClientUrl();
        if (!baseUrl || !id) return;
        const url = `${baseUrl}/main.aspx?pagetype=entityrecord&etn=${encodeURIComponent(entityName)}&id=${encodeURIComponent(id)}${formId ? `&formid=${encodeURIComponent(formId)}` : ""}`;
        if (typeof window !== "undefined" && window.open) {
            window.open(url, "_blank", "noopener,noreferrer");
        } else {
            context.navigation.openUrl(url);
        }
    }, [context]);

    const createNewRecord = useCallback(async (field?: string, column?: string, formId?: string): Promise<void> => {
        const pageInput = {
            entityName: dataset.getTargetEntityType(),
            pageType: "entityrecord",
            data : {},
            ...(formId ? { formId } : {}),
        }

        if(!isNullOrEmpty(field) && !isNullOrEmpty(column)) {
            pageInput.data = { [field as string]: column }
        }

        //@ts-expect-error - Method does not exist in PCF SDK however it should be use to maintain control state alive
        await context.navigation.navigateTo(pageInput, popupOtions);
    }, [context, dataset]);

    /** Opens quick create form (or create form) for an activity entity with the given record as "regarding" (createFromEntity). */
    const openCreateActivityForm = useCallback(async (
        activityEntityName: string,
        parentEntityName: string,
        parentId: string,
        parentName?: string
    ): Promise<void> => {
        if (shouldCreateInDialog(activityEntityName, parentEntityName, parentId) && isDialogTable(activityEntityName)) {
            let opened = false;
            try {
                await openActivityDialog({
                    mode: "create",
                    entity: activityEntityName,
                    regarding: {
                        entity: parentEntityName as "opportunity" | "lead" | "account",
                        id: parentId,
                        name: parentName ?? "",
                    },
                });
                opened = true;
            } catch (e) {
                console.warn("[Kanban] Aktivitätsdialog nicht verfügbar, öffne Schnellerfassung", e);
            }
            if (opened) {
                dataset.refresh();
                return;
            }
        }
        const nav = context.navigation as {
            openForm?: (
                options: {
                    entityName: string;
                    useQuickCreateForm?: boolean;
                    createFromEntity?: { entityType: string; id: string; name?: string };
                },
                formParameters?: Record<string, string>
            ) => Promise<unknown>;
        };
        if (typeof nav.openForm !== "function") {
            return;
        }
        const options: {
            entityName: string;
            useQuickCreateForm: boolean;
            createFromEntity: { entityType: string; id: string; name?: string };
        } = {
            entityName: activityEntityName,
            useQuickCreateForm: true,
            createFromEntity: {
                entityType: parentEntityName,
                id: parentId,
                ...(parentName != null && parentName !== "" ? { name: parentName } : {}),
            },
        };
        await nav.openForm(options, {});
    }, [context, dataset]);

    /**
     * Returns the Web API entity set name for a given entity logical name (for @odata.bind).
     * Standard entities use known plurals; custom entities fallback to logicalname + "s".
     */
    function getEntitySetName(logicalName: string): string {
        const map: Record<string, string> = {
            account: "accounts",
            contact: "contacts",
            opportunity: "opportunities",
            lead: "leads",
            incident: "incidents",
            systemuser: "systemusers",
            task: "tasks",
            appointment: "appointments",
            email: "emails",
        };
        return map[logicalName.toLowerCase()] ?? logicalName + "s";
    }

    /**
     * Holt den offiziellen Anzeigenamen des Datensatzes (Primary-Name-Attribut) per Web API.
     * So wird z. B. der Opportunity-Name verwendet, nicht der Kartentitel (der z. B. der Account-Name sein kann).
     */
    async function getRecordPrimaryName(entityName: string, recordId: string): Promise<string | undefined> {
        const w = typeof window !== "undefined" ? (window as any) : undefined;
        const webApi: any = w?.Xrm?.WebApi?.online ?? w?.Xrm?.WebApi;
        if (!webApi || typeof webApi.retrieveRecord !== "function") return undefined;
        try {
            let selectAttr = "name";
            const util = w?.Xrm?.Utility;
            if (util && typeof util.getEntityMetadata === "function") {
                const metadata = await util.getEntityMetadata(entityName);
                const primary = (metadata as { PrimaryNameAttribute?: string })?.PrimaryNameAttribute;
                if (primary) selectAttr = primary;
            }
            const rec = await webApi.retrieveRecord(entityName, recordId, `?$select=${selectAttr}`);
            const value = rec?.[selectAttr];
            return typeof value === "string" && value.trim() ? value.trim() : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Opens the related SharePoint folder in a new browser tab.
     * Fehlt die Ablage, wird sie nach Soll-Schema angelegt (lib/sharepoint-location.ts):
     * Chance → Account-Ablage (wird bei Bedarf angelegt) → Container `opportunity` dieses Accounts → Chancen-Ordner.
     * Nie unter dem Container eines fremden Accounts.
     */
    const openSharePointFolderInNewTab = useCallback(async (
        entityName: string,
        id: string,
        recordDisplayName?: string | null
    ): Promise<void> => {
        if (!id) return;

        const w = typeof window !== "undefined" ? (window as any) : undefined;
        const webApi: any = w?.Xrm?.WebApi?.online ?? w?.Xrm?.WebApi;
        if (!webApi?.retrieveMultipleRecords || !webApi?.execute) return;

        const cleanId = id.replace(/[{}]/g, "");
        const DEBUG = "[Kanban SharePoint]";
        const strings = getStrings(getLocaleFromLanguageId(
            (context as { userSettings?: { languageId?: number } }).userSettings?.languageId
        ));
        let usedAddOrEditLocation = false;

        const pcfApi = context.webAPI as any;
        const createRecord = (payload: Record<string, string>): Promise<any> =>
            typeof pcfApi?.createRecord === "function"
                ? pcfApi.createRecord("sharepointdocumentlocation", payload)
                : webApi.createRecord("sharepointdocumentlocation", payload);

        const api: SharePointLocationApi = {
            async findLocationIds(query) {
                const res = await webApi.retrieveMultipleRecords("sharepointdocumentlocation", buildLocationQuery(query));
                return ((res?.entities ?? []) as any[])
                    .map((e) => e?.sharepointdocumentlocationid as string | undefined)
                    .filter((v): v is string => !!v);
            },
            async findDefaultSiteId() {
                // Wie Pulse SharepointSiteRepository::default(): genau eine aktive Standard-Site.
                const res = await webApi.retrieveMultipleRecords(
                    "sharepointsite",
                    "?$select=sharepointsiteid&$filter=isdefault eq true and statecode eq 0 and statuscode eq 1&$top=2"
                );
                const sites: any[] = res?.entities ?? [];
                if (sites.length !== 1) {
                    console.warn(DEBUG, "Default SharePoint site not unique", { count: sites.length });
                    return undefined;
                }
                return sites[0]?.sharepointsiteid;
            },
            async getOpportunityAccountId(opportunityId) {
                const rec = await webApi.retrieveRecord("opportunity", opportunityId, "?$select=_parentaccountid_value");
                const raw = rec?._parentaccountid_value;
                return raw ? String(raw).replace(/[{}]/g, "") : undefined;
            },
            async getAccountName(accountId) {
                try {
                    const rec = await webApi.retrieveRecord("account", accountId, "?$select=name");
                    return typeof rec?.name === "string" && rec.name.trim() ? rec.name.trim() : undefined;
                } catch (e) {
                    console.warn(DEBUG, "Account not readable", { accountId, e });
                    return undefined;
                }
            },
            async createLocation({ parentId, parentType, relativeUrl, name }) {
                const created = await createRecord({
                    name,
                    relativeurl: relativeUrl,
                    [`parentsiteorlocation_${parentType}@odata.bind`]: `/${parentType}s(${parentId})`,
                });
                const createdId = created?.id ?? created?.entityId;
                console.warn(DEBUG, "Created location", { parentId, relativeUrl, createdId });
                return createdId;
            },
            async createRegardingLocation({ parentId, entityName: regardingEntity, recordId, folderName, recordName }) {
                const isTarget = recordId === cleanId;
                const clientUrl = getClientUrl();
                if (clientUrl) {
                    try {
                        const locationId = await addOrEditLocation(clientUrl, parentId, regardingEntity, recordId, folderName);
                        if (isTarget) usedAddOrEditLocation = true;
                        console.warn(DEBUG, "AddOrEditLocation created location", { regardingEntity, locationId });
                        return locationId;
                    } catch (addErr) {
                        console.warn(DEBUG, "AddOrEditLocation failed, falling back to createRecord", addErr);
                    }
                }
                const created = await createRecord({
                    name: recordName ?? folderName,
                    relativeurl: folderName,
                    [`regardingobjectid_${regardingEntity}@odata.bind`]: `/${getEntitySetName(regardingEntity)}(${recordId})`,
                    "parentsiteorlocation_sharepointdocumentlocation@odata.bind":
                        `/sharepointdocumentlocations(${parentId})`,
                });
                const createdId: string | undefined = created?.id ?? created?.entityId;
                if (createdId) await new Promise((resolve) => setTimeout(resolve, 1500));
                return createdId;
            },
        };

        try {
            const recordName = (await getRecordPrimaryName(entityName, cleanId))
                ?? (recordDisplayName?.trim() || undefined);
            const result = await ensureRecordLocation(api, entityName, cleanId, recordName);
            if (!result.ok) {
                console.warn(DEBUG, "No SharePoint location", { entityName, cleanId, reason: result.reason });
                toast.error(strings.sharePointFolderFailed(result.reason));
                return;
            }
            const locationId = result.locationId;

            // Resolve absolute URL and open SharePoint folder
            const request: any = {
                entity: { entityType: "sharepointdocumentlocation", id: locationId },
                getMetadata: () => ({
                    boundParameter: "entity",
                    parameterTypes: {
                        entity: {
                            typeName: "Microsoft.Dynamics.CRM.sharepointdocumentlocation",
                            structuralProperty: 5,
                        },
                    },
                    operationType: 1,
                    operationName: "RetrieveAbsoluteAndSiteCollectionUrl",
                }),
            };

            const response = await webApi.execute(request);
            if (!response?.ok || typeof response.json !== "function") return;
            const body = await response.json();
            const absoluteUrl: string | undefined = body?.AbsoluteUrl || body?.absoluteurl;
            if (!absoluteUrl) return;

            if (!usedAddOrEditLocation) await ensureSharePointFolderExists(absoluteUrl);
            if (typeof window !== "undefined" && window.open) {
                window.open(absoluteUrl, "_blank", "noopener,noreferrer");
            } else {
                context.navigation.openUrl(absoluteUrl);
            }
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : (err && typeof (err as any).message === "string")
                    ? (err as any).message
                    : (typeof err === "object" && err !== null)
                        ? JSON.stringify(err)
                        : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            console.warn(DEBUG, "Error", { message, stack, fullError: err });
            toast.error(strings.sharePointFolderFailed("error"));
        }
    }, [context]);

    return useMemo(
        () => ({
            openForm,
            openEntityInNewTab,
            createNewRecord,
            openCreateActivityForm,
            openSharePointFolderInNewTab,
        }),
        [openForm, openEntityInNewTab, createNewRecord, openCreateActivityForm, openSharePointFolderInNewTab]
    );
}