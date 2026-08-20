# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A PowerApps Component Framework (PCF) virtual control that renders Dataverse records as a Kanban board. Namespace: `novalogica`, constructor: `KanbanViewControl`. Supports OptionSet columns and Business Process Flows as view types, with drag-and-drop card movement.

## Build Commands

```bash
npm run build          # Build the control
npm run start          # Start PCF test harness
npm run start:watch    # Start with file watching
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix lint issues
npm run clean          # Clean build output
npm run rebuild        # Clean + build
npm run refreshTypes   # Regenerate ManifestTypes from ControlManifest.Input.xml
```

**Deployment** (use the dotnet global tool version of `pac`, not the npm version):
```bash
~/.dotnet/tools/pac auth create --environment https://vonmaehlen.crm4.dynamics.com
~/.dotnet/tools/pac pcf push --publisher-prefix nova
```

## Architecture

### Entry Point & Data Flow

`KanbanViewControl/index.ts` → PCF lifecycle (`init`, `updateView`, `destroy`). `updateView` renders `App.tsx` which is the React root.

**Data flow:** PCF dataset context → App fetches option sets + BPFs via `useDataverse` → transforms records into `CardItem[]` grouped by `ColumnItem[]` → Board renders columns with drag-and-drop cards → drag completion updates Dataverse via WebAPI.

### Consolidated configuration (`config` property)

- **`lib/board-config.ts`** is the single source: `parseBoardConfig` (section-isolated validation), path getters (`cfgBool` / `cfgString` / `cfgNumber` / `cfgValue`) reading a module-level cache via `getBoardConfig(context)`, `card.fields` derivations (`cfgFieldFlagSet`, `cfgFieldNumberMap`, `cfgFieldDisplayNames`, `cfgFieldsVisiblePerStage`, `cfgPersonaSets`, `cfgHighlights`, `cfgBackgroundColors`), and `buildConfigFromLegacyParameters` (migration export).
- **Precedence is per setting**: every consumer reads `config value ?? legacy property`. Nothing was removed, so old boards keep working. When adding a setting, wire both paths.
- `App.tsx` parses the config once with the error reporter (banner) and passes it into `useCardConfig`; components without that reporter (`Board`, `Column`, `ColumnHeader`, `CardDetails`, `index.ts`, `useDataverse`) use the cached path getters.
- **Migration export**: `App.tsx` puts the generated JSON on `window.kanbanViewControlConfigExport`; `version.ts` logs the `copy(...)` hint. The round-trip (legacy params → config → derived structures) is the thing to re-test when touching either side.
- Manifest: all legacy properties carry a `DEPRECATED - use Config: <path>` prefix in their `description-key`.

### Key Modules

- **`App.tsx`** — Root component. Manages views, transforms dataset records to cards, handles column filtering, provides `BoardContext`.
- **`context/board-context.ts`** — React Context providing global state: active view, columns, view entity, dataset context, dragging ref.
- **`hooks/useDataverse.ts`** — All Dataverse/WebAPI calls: `updateRecord`, `getBusinessProcessFlows`, `getOptionSets`, `getRecordCurrentStage`, `retrieveStatusMetadata`.
- **`hooks/useDnD.ts`** — Drag-and-drop handler. BPF views open form on drop; OptionSet views do optimistic update with rollback on failure.
- **`hooks/useNavigation.ts`** — `openForm` and `createNewRecord` via PCF navigation API.
- **`hooks/service.tsx`** — Singleton XRM service for raw HTTP fetch and `Xrm.WebApi.online.execute`.
- **`lib/utils.ts`** — Helpers including `orderStages` (chains BPF stages by `NextStageId`), `pluralizedLogicalNames`, `getColumnValue`.
- **`lib/card-drag.ts`** — Drag-drop UI utilities: `moveCard`, `getListStyle`, `getItemStyle`.

### Component Hierarchy

Board → QuickFilters + CommandBar (view selector) + Column[] → ColumnHeader + Card[] → CardHeader + CardBody + CardDetails + CardFooter

### Quick Filters (`components/quick-filters/QuickFilters.tsx`)

Responsive filter bar above the board with inline dropdowns, a funnel button (right-aligned, only shown when there are popup filters), sorting, filter presets, and search.

- **`inPopup: true` filters always stay in the popup** — they never render inline regardless of screen width.
- **Responsive overflow:** Inline filters are measured via `ResizeObserver`. Filters that don't fit are moved into the funnel-button popup alongside the always-popup filters.
- **Funnel button visibility:** The funnel button is hidden entirely when no filters end up in the popup (no `inPopup: true` filters configured AND all inline filters fit).
- The funnel button shows a badge with the count of active hidden filters.
- Layout: `[Inline filters...]  [Funnel ▼] [Preset ▼] [Sort ▼] [Search]`

### Numeric filters on OptionSet fields

- OptionSet/Choice columns (Picklist, Status, State, MultiSelectPicklist — detected via `isOptionSetColumnDataType`) keep the **value-list** quick filter UI; they are deliberately excluded from the number-field heuristic in `App.tsx` (`getValue` returns a number and would otherwise trigger the number filter UI).
- A **numeric filter value** (`eq:`/`gt:`/`lt:`/`gte:`/`lte:`/`between:`, typically from a filter preset) on such a field is compared against the **numeric option id**, never against the localized label. Implementation: `filterRecords` stores the id(s) as `${field}OptionIdRaw` on the card (also for filter-only fields that are not rendered on the card), `cardPassesQuickFilters` compares via `isOptionSetIdInNumberFilterRange`.
- Multiselect choices match if **any** id satisfies the condition; empty choices never match an active numeric filter. Labels and operators in one selection combine with **OR**.
- Equality is `eq:` (e.g. `{"statecode":"eq:0"}` for active records). `eq:` is a full number-filter operator: it is parsed in `parseNumberFilterValue`, evaluated in `isNumberInFilterRange` and offered as "Equals"/"Gleich" in the `NumberFilter` UI for Number/Currency fields.
- In the quick filter dropdown an active numeric value is displayed as the **matching option labels**, not as the expression: `quickFilterOptionLabelsById` (App, derived from the cards: `${field}OptionIdRaw` -> formatted label) maps ids to labels, `QuickFilters.renderFilterControl` marks those entries as selected. Only expressions that resolve to no loaded option are rendered symbolically (`= 4`) via `formatNumberFilterExpression`.
- Empty display names from `fieldDisplayNamesOnCard` (and the hide-label config) apply to the **card only** — `quickFilterFieldsConfig` and `sortFieldsConfig` fall back to the column display name so filter and sort dropdowns are never unlabeled.
- The `OptionIdRaw` suffix ends in `Raw` on purpose: raw keys are excluded from the precomputed card search text and are not rendered on cards. Sorting/column sums keep using `${field}Raw` and are unaffected.

### Card background colors (`cardBackgroundColors`)

- JSON rules `{logicalName, color, optionValue?, value?}` parsed once in `useCardConfig` (`CardBackgroundColorConfig`), applied per card in `Card.tsx` (`backgroundColor` memo, first matching rule wins).
- `optionValue` compares **numeric option ids** via `optionIdMatches` — language-independent. `value` compares the formatted text (case-insensitive) for field types without an option id.
- `filterRecords` stores `${field}${OPTION_ID_SUFFIX}` for **every** OptionSet/Choice **and** Boolean column (not only quick-filter fields), so coloring works for columns that are not rendered on the card. `toOptionSetNumericIds` maps booleans to 1/0. `OPTION_ID_SUFFIX` lives in `lib/constants.ts`.
- The color is applied as the CSS variable `--card-bg` plus the class `card-container--custom-bg`; the hover state darkens it with an inset overlay so no color math is needed in JS. An inline `background-color` would have killed the hover effect.

### Key Dependencies

- `@hello-pangea/dnd` — Drag-and-drop (fork of react-beautiful-dnd)
- `@fluentui/react` — UI components (Dropdown, etc.)
- `react-hot-toast` — Toast notifications
- `pcf-scripts` — PCF build tooling

### Configuration Properties (ControlManifest.Input.xml)

The control accepts dataset binding plus input properties: `defaultView`, `filteredBusinessProcessFlows` (JSON array of BPF names to exclude), `businessProcessFlowStepOrder` (JSON array with id/order pairs), `hideViewBy`, `allowCardMove`, `hideEmptyColumns`, `allowCreateNew`, `notificationPosition`.

### Important Behaviors

- **Status Reason** column only shows active statuses (filtered via `retrieveStatusMetadata`).
- BPF stage drag opens a form popup instead of directly updating the record.
- Records without a matching column value go into an "Unallocated" column.
- The control is `control-type="virtual"` — uses React platform libraries, not a DOM container.
- Generated types live in `KanbanViewControl/generated/ManifestTypes.d.ts` — regenerate with `npm run refreshTypes` after manifest changes.
