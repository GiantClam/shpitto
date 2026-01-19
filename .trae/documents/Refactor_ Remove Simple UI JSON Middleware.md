# Remove Intermediate "Simple UI JSON" Step

## Goal
Simplify the generation pipeline by removing the redundant `Planner` node and `simple_ui_json` state. Directly convert the text-based **Project Outline** into the final **Puck JSON** using the Architect node, relying on the Critic node for validation.

## Technical Implementation

### 1. Refactor Agent Graph (`apps/web/lib/agent/graph.ts`)
*   **Update State Interface**: Remove `simple_ui_json`.
*   **Delete Planner Node**: Remove the `plannerNode` function entirely.
*   **Update Conversation Node**: 
    *   Logic change: When plan is approved, set `nextPhase = "architect"` (or "building") directly.
*   **Update Architect Node**: 
    *   Change input source: Use `state.project_outline` instead of `state.simple_ui_json`.
    *   Update System Prompt: Explicitly instruct to generate Puck JSON from the textual outline.
*   **Update Graph Definition**: Remove `planner` node and update edges to connect `conversation` -> `architect`.

### 2. Update API Route (`apps/web/app/api/chat/route.ts`)
*   Remove `simple_json` from the manual stream data payload.
*   Ensure `project_outline` is passed correctly in the stream if needed for frontend context.

### 3. Update Frontend (`apps/web/app/page.tsx`)
*   **State Cleanup**: Remove `const [simplePlan, setSimplePlan]` and related effects.
*   **UI Cleanup**: Remove the "Plan Review" component (the intermediate view showing themes/pages).
*   **Interaction Flow**: 
    *   Left panel: Chat & Text Outline approval remains.
    *   Right panel: Shows "Ready to Build" placeholder or Loading state until `projectBlueprint` (Puck JSON) is ready.

## User Experience Change
*   **Before**: Chat -> Approve Text -> View Intermediate JSON UI -> Approve JSON -> View Final Site.
*   **After**: Chat -> Approve Text -> View Final Site. (Faster, less friction).
