# Phase 4: Cloudflare Pages Deployment (The Delivery)

I have audited the current state and confirmed that the **Brain** (Agent) and **Schema** (Contract) are ready. The final missing piece for the "Commercial Loop" is the **Delivery System**—the ability to take the generated JSON and deploy it to a live Cloudflare Pages site with D1 bindings.

## 1. Cloudflare Service (`apps/web/lib/cloudflare.ts`)
I will implement a robust TypeScript service to interact with the Cloudflare API.

*   **API Client**: `CloudflareClient` class using `fetch` (native in Next.js).
*   **Key Methods**:
    *   `createProject(name: string)`: Ensures the Pages project exists.
    *   `uploadDeployment(name: string, files: FormData)`: Performs the Direct Upload.
    *   `bindD1(name: string, dbId: string)`: Configures the D1 binding for the project.
    *   `createCustomDomain(zoneId: string, hostname: string)`: Handles SaaS custom domains.

## 2. Asset Bundling Logic (`apps/web/lib/bundler.ts`)
I need a utility to package the site assets before upload. Since we are in a Next.js environment, we can't easily "build" a separate React app inside a running Request.

**Strategy for "Shell Architecture"**:
Instead of building a full Next.js app for *each* tenant (slow, resource-heavy), we will deploy a **Single Universal Shell** for all tenants.
1.  **The Shell**: A pre-built static HTML/JS bundle (stored in `apps/web/templates/shell`) that knows how to fetch `site-config.json` and render it using the Puck runtime.
2.  **The Bundle**: For each deployment, we simply take this "Universal Shell" and inject the specific `site-config.json`.
3.  **The Edge**: The Cloudflare Worker (Functions) serves this shell and the specific JSON.

## 3. Server Action Integration
I will create a new Server Action `deployProject(projectId: string)` in `apps/web/app/actions.ts` that:
1.  Fetches the valid project config from DB.
2.  Calls `bundler.createBundle(config)`.
3.  Calls `cloudflare.uploadDeployment()`.
4.  Updates the `deployments` table in DB.

## 4. UI Update
*   Update `apps/web/app/editor/[projectId]/page.tsx` to include a real "Deploy" button that calls this Server Action and polls for status.

*Note: This approach (Universal Shell) is the key to "Instant Deployment" (< 3s) vs "Building" (> 1min).*