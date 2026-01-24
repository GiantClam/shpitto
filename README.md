# Shpitto - AI Portal Generation Platform

This repository contains the source code for Phase 1 (Industry-v0) of the Shpitto platform.

## Structure

*   `apps/web`: Next.js application with Puck editor and Chat interface.
*   `packages/schema`: Shared Zod schemas and TypeScript types.
*   `packages/db`: Database schema and client.

## Getting Started

### Prerequisites

*   Node.js 18+
*   pnpm
*   PostgreSQL (or Docker)

### Installation

1.  **Install Node dependencies:**
    ```bash
    pnpm install
    ```

### Running the Development Environment

1.  **Start Frontend:**
    ```bash
    cd apps/web
    pnpm dev
    ```

2.  **Access:**
    *   Frontend: [http://localhost:3000](http://localhost:3000)

### Development Features

*   **Instant Login**: In development mode (`NODE_ENV=development`), the login page includes a "Dev Mode: Instant Login" button to bypass authentication.

## Protocol

The core protocol is defined in `packages/schema/src/project-schema.ts`. This ensures that the AI generation matches the frontend's rendering capabilities.

## Infrastructure

Initialize your Supabase database using the script in `packages/db/supabase_schema.sql`.
This sets up the `shpitto_projects` and `shpitto_deployments` tables required for SaaS mode.
