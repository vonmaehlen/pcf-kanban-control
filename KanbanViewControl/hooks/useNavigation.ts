import { IInputs } from "../generated/ManifestTypes";
import { isNullOrEmpty } from "../lib/utils";

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

export const useNavigation = (context: ComponentFramework.Context<IInputs>) => {
    const { dataset } = context.parameters;

    const openForm = async (entityName: string, id?: string): Promise<void> => {
        const pageInput = {
            entityName: entityName,
            entityId: id,
            pageType: "entityrecord"
        }

        //@ts-expect-error - Method does not exist in PCF SDK however it should be use to maintain control state alive
        await context.navigation.navigateTo(pageInput, popupOtions);
    }

    /** Opens the entity record in a new browser tab (_blank). */
    const openEntityInNewTab = (entityName: string, id: string): void => {
        const baseUrl = getClientUrl();
        if (!baseUrl || !id) return;
        const url = `${baseUrl}/main.aspx?pagetype=entityrecord&etn=${encodeURIComponent(entityName)}&id=${encodeURIComponent(id)}`;
        if (typeof window !== "undefined" && window.open) {
            window.open(url, "_blank", "noopener,noreferrer");
        } else {
            context.navigation.openUrl(url);
        }
    }

    const createNewRecord = async (field?: string, column?: string): Promise<void> => {
        const pageInput = {
            entityName: dataset.getTargetEntityType(),
            pageType: "entityrecord",
            data : {}
        }

        if(!isNullOrEmpty(field) && !isNullOrEmpty(column)) {
            pageInput.data = { [field as string]: column }
        }

        //@ts-expect-error - Method does not exist in PCF SDK however it should be use to maintain control state alive
        await context.navigation.navigateTo(pageInput, popupOtions);
    }

    /** Opens quick create form (or create form) for an activity entity with the given record as "regarding" (createFromEntity). */
    const openCreateActivityForm = async (
        activityEntityName: string,
        parentEntityName: string,
        parentId: string,
        parentName?: string
    ): Promise<void> => {
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
    };

    return {
        openForm,
        openEntityInNewTab,
        createNewRecord,
        openCreateActivityForm,
    };
}