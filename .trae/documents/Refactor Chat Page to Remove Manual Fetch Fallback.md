Based on the analysis of `apps/web/app/page.tsx` and `apps/web/app/api/chat/route.ts`, here is the plan to address the issue.

### **Reason for the Issue**
The code enters the fallback branch `[Page] SDK methods missing` because the code explicitly checks if `handleSubmit` or `append` (returned from `useChat`) are functions. If they are `undefined`, it triggers the fallback.
- **Why are they undefined?** In a properly configured environment with `@ai-sdk/react` v3+, `useChat` *always* returns these methods. The presence of this fallback and the `as any` cast suggests the previous developer encountered type issues or initialization problems (likely during an upgrade or due to strict TypeScript checks) and added this defensive code as a workaround.
- **Why is it bad?** The fallback re-implements the entire streaming protocol manually (`parseStreamChunk`), which is redundant because the backend (`route.ts`) already implements the standard Vercel AI Data Stream protocol (`0:text`, `8:data`) that `useChat` supports natively.

### **Proposed Fix (Best Practice)**
We should remove the manual fallback and rely entirely on `useChat`, which is the standard and robust way to handle this.

1.  **Refactor `apps/web/app/page.tsx`**:
    -   Remove the manual `fetch` logic and `parseStreamChunk` function.
    -   Remove the `localInput` / `effectiveInput` workarounds.
    -   Remove the `as any` cast on `useChat` to expose and fix real type issues.
    -   Use `handleSubmit` directly from `useChat`.
    -   Simplify `wrappedHandleSubmit` to strictly handle the form submission using the SDK.

2.  **Verification**:
    -   The backend `apps/web/app/api/chat/route.ts` is already correctly setting headers (`X-Vercel-AI-Data-Stream: v1`) and format (`0:...`, `8:...`).
    -   `useChat` will automatically parse this stream, update `messages`, and populate `data` (which the existing `useEffect` already handles).

### **Implementation Steps**
1.  **Modify `apps/web/app/page.tsx`**:
    -   Remove `localInput` state and related logic.
    -   Simplfy `wrappedHandleSubmit` to just call `handleSubmit`.
    -   Delete the `else` block (manual fetch) and `parseStreamChunk`.
    -   Clean up `useChat` initialization.

This will result in much cleaner, "idiomatic" AI SDK code.
