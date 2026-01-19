# Fix Frontend Data Binding with Best Practices

## Problem
Backend generates a new `messageId` for data packets, but frontend `useChat` generates its own ephemeral ID for the incoming message stream. They never match, causing data (like the Plan Outline) to be orphaned and not rendered.

## Solution: "Latest-to-Latest" Binding Strategy
According to Vercel AI SDK patterns, stream data is inherently associated with the active response stream. Therefore, we can safely assume that **the most recently received data packet belongs to the most recently generated assistant message**.

## Technical Implementation

### 1. Update `apps/web/app/page.tsx`
Refactor the `extendedMessages` mapping logic:
*   **Step 1 (Strict)**: Try to match `data.messageId === message.id`.
*   **Step 2 (Heuristic)**: If no strict match, and:
    *   The message is from `assistant`.
    *   The message is the **last** one in the list.
    *   We have available data.
    *   Then -> Bind the **last** item in the `data` array to this message.

This ensures that even without ID synchronization, the UI will correctly display the "Plan Proposed" card under the bot's latest response.

## Verification
1.  **Chat**: Send a request like "Build a towel factory site".
2.  **Observe**: When the bot replies with the text plan, the "📋 Proposed Plan" UI card should appear immediately below it.
3.  **Action**: Click "Approve Plan & Build" to confirm the flow continues.
