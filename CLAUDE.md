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
