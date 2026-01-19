# Improve Agent Reliability with Structured Output

## Goal
Replace the fragile string-matching control flow (e.g., checking for "✅ PLAN APPROVED") with a robust **Structured Output** mechanism using `model.withStructuredOutput()`. This ensures the LLM explicitly signals its intent to transition states (Response vs. Propose Plan vs. Confirm Build).

## Technical Implementation

### 1. Define Intent Schema (`apps/web/lib/agent/graph.ts`)
Create a Zod schema to categorize the conversation state:
```typescript
const ConversationIntentSchema = z.object({
  intent: z.enum(["chat", "propose_plan", "confirm_build"]),
  message: z.string().describe("The response message to show to the user"),
  plan_outline: z.string().optional().describe("The detailed text outline of the website plan, only required when intent is 'propose_plan'")
});
```

### 2. Refactor `conversationNode`
*   **Bind Schema**: Use `model.withStructuredOutput(ConversationIntentSchema)` instead of raw `invoke`.
*   **Update Prompt**: Instruct the LLM to choose the correct `intent` based on the conversation history:
    *   If gathering info -> `chat`
    *   If ready to plan -> `propose_plan`
    *   If user approves plan -> `confirm_build`
*   **Handle Output**:
    *   `intent === "chat"`: Stay in `conversation`.
    *   `intent === "propose_plan"`: Update `project_outline` state, stay in `conversation` (waiting for approval).
    *   `intent === "confirm_build"`: Transition to `architect`.

### 3. Cleanup Legacy Logic
*   Remove the old string parsing logic (`content.includes("✅ PLAN APPROVED")`).
*   Remove the manual "hard overrides" for "approve" keywords, as the LLM's semantic understanding will now map those to `confirm_build`.

## Verification
1.  **Chat**: Verify normal conversation works (`intent: "chat"`).
2.  **Plan**: Verify the agent proposes a plan (`intent: "propose_plan"`) and the frontend receives the outline.
3.  **Approve**: Verify saying "Approve", "Build it", or "Looks good" correctly triggers `intent: "confirm_build"` and moves to the Architect node.
