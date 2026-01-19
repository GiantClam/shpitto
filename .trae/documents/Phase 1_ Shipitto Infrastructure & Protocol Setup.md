# Phase 1 Implementation Plan: Infrastructure & Protocol Definition (Industry-v0)

Based on your detailed requirements, I will initialize the **shipitto** monorepo and build the core infrastructure. This plan covers the "Day 1-3" scope to establish the "skeleton" of the system.

## 1. Monorepo Initialization
*   **Structure**: Set up a `pnpm` workspace.
*   **Directories**:
    *   `packages/schema`: Shared TypeScript/Zod definitions.
    *   `apps/frontend`: Next.js (Vercel) application.
    *   `apps/backend`: FastAPI (Railway) application.
    *   `infrastructure`: SQL and configuration files.

## 2. Shared Protocol Definition (`packages/schema`)
*   **Goal**: Establish the contract between AI and UI.
*   **Action**:
    *   Install `zod`.
    *   Implement `project-schema.ts` containing:
        *   `BrandingSchema` (Colors, Typography).
        *   `PuckDataSchema` (Component structure).
        *   `ProjectSchema` (Full blueprint).
    *   Export TypeScript types for frontend usage.

## 3. Backend Setup (`apps/backend`)
*   **Goal**: Intelligent Core (LangGraph + Gemini + Dify).
*   **Action**:
    *   Initialize Python environment (`requirements.txt`).
    *   **Dependencies**: `fastapi`, `uvicorn`, `langgraph`, `google-generativeai`, `httpx`.
    *   **API Implementation**:
        *   `POST /api/chat`: Endpoint to trigger LangGraph workflow (mocked initially).
        *   `POST /api/upload`: Proxy endpoint for Dify file upload.
        *   **Middleware**: Tenant ID extraction from headers.

## 4. Frontend Setup (`apps/frontend`)
*   **Goal**: Interactive Visual Editor (Next.js + Puck).
*   **Action**:
    *   Initialize Next.js 14+ (App Router).
    *   **Dependencies**: `@measured-co/puck`, `ai` (Vercel SDK), `lucide-react`, `tailwindcss`.
    *   **Layout**: Split-screen design (Left: Chat/Control, Right: Puck Preview).
    *   **Components**:
        *   `PuckEditor`: A wrapper around Puck to render the JSON blueprint.
        *   `ChatPanel`: Using Vercel AI SDK to stream responses.

## 5. Infrastructure Code (`infrastructure`)
*   **Goal**: Database Schemas.
*   **Action**:
    *   `postgres_init.sql`: SQL to create `tenants`, `knowledge_base` (with RLS), and `website_templates` (with `pgvector`).
    *   `d1_schema.sql`: Schema for runtime data (e.g., inquiries).

## 6. Verification
*   **Schema**: Verify Zod types export correctly.
*   **Backend**: Start FastAPI and test health endpoints.
*   **Frontend**: Start Next.js and verify Puck editor renders a sample JSON.
