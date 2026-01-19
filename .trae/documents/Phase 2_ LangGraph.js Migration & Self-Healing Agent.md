# Phase 2: LangGraph.js Migration (The Brain)

I will now migrate the agentic logic from Python to TypeScript using **LangGraph.js**, implementing the "Self-Healing" capabilities directly within the Next.js API.

## 1. Environment Setup
*   **Dependencies**: Install `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, and `zod-to-json-schema` in `apps/web`.

## 2. Agent Graph Architecture (`apps/web/lib/agent/graph.ts`)
I will create a stateful graph with the following nodes:

### A. State Definition
*   **`AgentState`**:
    *   `messages`: Array of BaseMessages (Human/AI).
    *   `project_json`: The current draft of the project blueprint.
    *   `validation_error`: String (optional) capturing Zod validation issues.
    *   `attempt_count`: Number to limit self-healing retries.

### B. Nodes
1.  **`architect`**:
    *   Uses GPT-4o (via Vercel AI SDK or LangChain) to generate the JSON.
    *   System prompt will be updated to strictly follow the Zod `ProjectSchema`.
2.  **`validator`**:
    *   Parses `project_json` against `ProjectSchema` (from `@industry/schema`).
    *   If valid -> End.
    *   If invalid -> Returns error message to state and routes back to `architect`.

### C. Edges (Control Flow)
*   **`should_continue`**:
    *   Checks if `validation_error` exists.
    *   If yes AND `attempt_count < 3` -> Route to `architect` (Self-Healing).
    *   Else -> End.

## 3. API Route Integration (`apps/web/app/api/agent/route.ts`)
I will update the existing API route to:
1.  Initialize the Graph.
2.  Invoke it with the user's prompt.
3.  Stream the final valid JSON back to the client.

*Note: This moves the intelligence to the Edge, removing the dependency on the Python backend for generation.*