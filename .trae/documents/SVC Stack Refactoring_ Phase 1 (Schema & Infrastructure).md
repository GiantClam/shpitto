# SVC Stack Refactoring Plan: Supabase + Vercel + Cloudflare

I will now proceed with the architectural upgrade to the **SVC Stack (Supabase + Vercel + Cloudflare)** as requested. This refactoring will transition the project from a prototype to a commercial-grade SaaS platform with multi-tenant isolation, independent RAG via Dify, and edge-first deployment.

## 1. Core Architecture: The "SVC" Triangle

### A. Vercel (Brain & Interaction)
*   **Next.js 15**: Upgrade to Server Actions for all data mutations.
*   **LangGraph.js**: Migrate Python logic to TypeScript agents running on Vercel Functions (Edge/Serverless).
*   **Vercel AI SDK 4.0**: Implement `streamUI` for generative interaction.

### B. Supabase (Storage & Auth)
*   **PostgreSQL + RLS**: The single source of truth for Project Blueprints (`ProjectSchema`) and Tenant data.
*   **Auth**: Use Supabase Auth for user management.
*   **Drizzle ORM**: Connect Drizzle to Supabase Postgres via the `postgres-js` driver (or HTTP via Pglite for Edge compatibility if needed, but standard connection pooling is preferred for Supabase).

### C. Cloudflare (Delivery)
*   **Pages**: Hosting for generated sites.
*   **D1/R2**: Edge storage for the generated sites' dynamic data and media.

## 2. Implementation Roadmap

### Phase 1: Infrastructure & Schema (The Foundation)
1.  **Project Schema (Zod)**: Define the strict "Contract" in `packages/schema/src/project.ts` (new package). This Zod schema will drive both the Drizzle database columns and the Agent validation logic.
2.  **Supabase Setup**:
    *   Configure Drizzle to connect to a Supabase Postgres instance.
    *   Create tables: `tenants`, `projects`, `deployments`.
    *   Implement RLS policies (simulated via Drizzle `where` clauses for now, enforced by Supabase in prod).

### Phase 2: LangGraph.js Migration (The Brain)
1.  **Port Agent Logic**: Create `apps/web/app/api/agent/graph.ts`.
    *   **Nodes**: `ResearchNode` (Dify), `ArchitectNode` (Gemini), `ValidatorNode` (Zod).
    *   **Self-Healing**: Implement the loop where validation failures trigger a retry with error context.

### Phase 3: Generative UI (The Experience)
1.  **StreamUI Integration**: Update the Chat Interface to render "Skeleton -> Magic UI" transitions using `streamUI`.

### Phase 4: Deployment Pipeline (The Delivery)
1.  **Cloudflare Service**: Port the Python `cloudflare.py` service to TypeScript (`apps/web/lib/cloudflare.ts`).
2.  **Asset Bundling**: Implement the JSON bundling logic in Node.js.

## 3. Immediate Execution Plan (This Turn)

I will focus on **Phase 1: Infrastructure & Schema**.

1.  **Create `packages/schema`**: Initialize a shared workspace for Zod definitions.
2.  **Define `ProjectSchema`**: Implement the comprehensive Zod schema including Branding, Pages, and Database definitions.
3.  **Update `packages/db`**: Reconfigure Drizzle to use the new Schema and prepare for Supabase connection (using `dotenv` for credentials).
4.  **Refactor `apps/web/app/actions.ts`**: Update Server Actions to use the new Schema validation.

*Note: I will continue working in the `industry-v0` monorepo.*