# Implementation Plan - Database Schema Rename

**Objective:** Rename all database tables with `shipitto_` prefix to avoid conflicts and improve namespacing.

## Phase 1: Schema Refactoring

- [ ] **Task 1: Rename Tables in Schema Definition**
  - **Files**: `packages/db/src/schema.ts`
  - **Steps**:
    1. Rename table `projects` to `shipitto_projects`.
    2. Rename table `deployments` to `shipitto_deployments`.
    3. Update foreign key references in `shipitto_deployments` to point to `shipitto_projects`.
  - **Verification**: `pnpm build` in `packages/db` should pass without type errors.

- [ ] **Task 2: Migration Generation (If applicable)**
  - **Files**: `packages/db`
  - **Steps**:
    1. Check if there are existing migrations or if this is a schema-first change for local dev.
    2. Since we are using Drizzle with SQLite/D1 for now (based on file content), we assume schema update is sufficient for local dev.
  - **Verification**: N/A for this specific task as we are modifying the definition.
