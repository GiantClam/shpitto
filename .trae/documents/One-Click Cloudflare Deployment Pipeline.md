# One-Click Deployment & Cloudflare Integration Plan

I will implement a robust, asynchronous deployment pipeline that automates the transition from "Generated Plan" to "Live Website" using Cloudflare Pages and D1.

## 1. Backend Infrastructure (`apps/backend/services`)
I will create a new `services` directory to encapsulate the core logic:

### A. `cloudflare.py` (Cloudflare Service)
Handles all interactions with Cloudflare APIs using `httpx`.
*   **`create_project`**: Ensures a Pages project exists for the site.
*   **`create_deployment`**: Performs the "Direct Upload" of assets.
*   **`bind_d1`**: Binds the D1 database to the Pages Functions.
*   **`create_custom_domain`**: Handles the SaaS custom hostname creation.

### B. `bundler.py` (Asset Bundler)
Prepares the physical files required for deployment.
*   **`create_bundle(blueprint)`**:
    1.  Creates a temporary build directory.
    2.  **Static Shell**: Generates `public/index.html` (a minimal React/Puck renderer shell).
    3.  **Config**: Writes the generated `SimpleProjectBlueprint` to `public/site-config.json`.
    4.  **Functions**: Generates `functions/api/inquiry.js` for handling form submissions via D1.

## 2. API Layer (`apps/backend/api`)

### A. `deploy.py` (New Endpoint)
*   **`POST /deploy/{thread_id}`**:
    *   Retrieves the latest approved blueprint from the LangGraph state.
    *   Triggers the **Async Background Task**.
    *   Returns a `job_id` immediately.
*   **`GET /deploy/status/{job_id}`**:
    *   Allows the frontend to poll for progress (e.g., "Bundling...", "Uploading...", "Live at...").

### B. `main.py`
*   Register the new `deploy` router.

## 3. Deployment Workflow (Async Task)
The background task will execute the 5-step pipeline:
1.  **Bundle**: Generate files locally.
2.  **Provision**: Setup Cloudflare Project & D1 bindings.
3.  **Upload**: Push files to Cloudflare Pages.
4.  **Domain**: (Optional) Configure default `.pages.dev` subdomain.
5.  **Complete**: Update status with the live URL.

## 4. Configuration
*   I will read `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from environment variables.
*   If credentials are missing, I will **mock** the successful response to demonstrate the UI flow without blocking.

## Verification
*   You will be able to click a "Deploy" button (simulated via API call).
*   The system will process in the background.
*   You will receive a "Live URL" upon completion.