export class CloudflareClient {
  private accountId: string;
  private apiToken: string;
  private baseUrl = process.env.CLOUDFLARE_BASE_URL || "https://api.cloudflare.com/client/v4";

  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN || "";
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.apiToken}`,
    };
  }

  async createProject(name: string) {
    if (!this.accountId || !this.apiToken) {
      console.log("[Cloudflare] Missing credentials, mocking createProject");
      return { name };
    }

    try {
      console.log(`[Cloudflare] Creating/Verifying project: ${name}`);
      const res = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects/${name}`, {
        method: "GET",
        headers: this.headers,
      });

      const projectConfig = {
        name,
        production_branch: "main",
        deployment_configs: {
          production: {
            compatibility_date: "2026-01-13",
            compatibility_flags: []
          },
          preview: {
            compatibility_date: "2026-01-13",
            compatibility_flags: []
          }
        }
      };

      if (res.ok) {
        console.log(`[Cloudflare] Project ${name} already exists, updating config...`);
        const updateRes = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects/${name}`, {
          method: "PATCH",
          headers: { ...this.headers, "Content-Type": "application/json" },
          body: JSON.stringify(projectConfig),
        });
        return await updateRes.json();
      }

      console.log(`[Cloudflare] Project ${name} not found, creating...`);
      const createRes = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(projectConfig),
      });
      
      const data = await createRes.json();
      if (!createRes.ok) {
        console.error("[Cloudflare] Create Project Error Response:", JSON.stringify(data, null, 2));
        throw new Error(data.errors?.[0]?.message || `Create project failed with status ${createRes.status}`);
      }
      
      console.log(`[Cloudflare] Project ${name} created successfully`);
      return data;
    } catch (e) {
      console.error("[Cloudflare] Create Project Error:", e);
      throw e;
    }
  }

  async uploadDeployment(projectName: string, bundle: { manifest: Record<string, string>, fileEntries: any[] }) {
    if (!this.accountId || !this.apiToken) {
      console.log("[Cloudflare] Missing credentials, mocking uploadDeployment");
      return {
        result: {
          url: `https://${projectName}.pages.dev`,
          id: "mock-deployment-id"
        }
      };
    }

    try {
      console.log(`[Cloudflare] Starting 4-step deployment for project: ${projectName}`);
      
      // Step 1: Get upload token
      console.log("[Cloudflare] Step 1: Getting upload token...");
      const tokenRes = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/upload-token`, {
        method: "GET",
        headers: this.headers,
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("[Cloudflare] Get Upload Token Error:", JSON.stringify(tokenData, null, 2));
        throw new Error(tokenData.errors?.[0]?.message || `Get upload token failed with status ${tokenRes.status}`);
      }
      
      const jwt = tokenData.result?.jwt;
      if (!jwt) {
        throw new Error("No JWT token returned from upload-token endpoint");
      }
      console.log("[Cloudflare] Upload token obtained successfully");

      // Step 2: Upload files to buckets using JSON array format
      console.log("[Cloudflare] Step 2: Uploading files to buckets...");
      const uploadPayload = bundle.fileEntries.map(entry => ({
        key: entry.hash,
        value: entry.base64Content,
        metadata: {
          contentType: entry.type
        },
        base64: true
      }));

      const uploadRes = await fetch(`${this.baseUrl}/pages/assets/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(uploadPayload),
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        console.error("[Cloudflare] Upload Buckets Error:", JSON.stringify(uploadData, null, 2));
        throw new Error(uploadData.errors?.[0]?.message || `Upload buckets failed with status ${uploadRes.status}`);
      }
      console.log("[Cloudflare] Files uploaded to buckets successfully");

      // Step 3: Upsert hashes
      console.log("[Cloudflare] Step 3: Upserting hashes...");
      const hashes = bundle.fileEntries.map(entry => entry.hash);
      
      const upsertRes = await fetch(`${this.baseUrl}/pages/assets/upsert-hashes`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ hashes }),
      });

      const upsertData = await upsertRes.json();
      if (!upsertRes.ok) {
        console.error("[Cloudflare] Upsert Hashes Error:", JSON.stringify(upsertData, null, 2));
        throw new Error(upsertData.errors?.[0]?.message || `Upsert hashes failed with status ${upsertRes.status}`);
      }
      console.log("[Cloudflare] Hashes upserted successfully");

      // Step 4: Create deployment with manifest
      console.log("[Cloudflare] Step 4: Creating deployment...");
      const deploymentFormData = new FormData();
      deploymentFormData.append("manifest", JSON.stringify(bundle.manifest));
      deploymentFormData.append("branch", "main");

      const deployRes = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments`, {
        method: "POST",
        headers: this.headers,
        body: deploymentFormData,
      });

      const deployData = await deployRes.json();
      if (!deployRes.ok) {
        console.error("[Cloudflare] Create Deployment Error:", JSON.stringify(deployData, null, 2));
        throw new Error(deployData.errors?.[0]?.message || `Create deployment failed with status ${deployRes.status}`);
      }

      const deploymentId = deployData.result.id;
      console.log(`[Cloudflare] Deployment created: ${deploymentId}`);

      // Wait for deployment to be ready
      console.log(`[Cloudflare] Waiting for deployment ${deploymentId} to be ready...`);
      let attempts = 0;
      const maxAttempts = 20;
      while (attempts < maxAttempts) {
        const statusRes = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`, {
          method: "GET",
          headers: this.headers,
        });
        const statusData = await statusRes.json();
        if (statusRes.ok) {
          const deploy = statusData.result;
          const stages = deploy.stages || [];
          const deployStage = stages.find((s: any) => s.name === "deploy");
          const stageStatus = deployStage?.status || "unknown";
          
          console.log(`[Cloudflare] Current stage: ${deploy.latest_stage?.name} (${deploy.latest_stage?.status}), Deploy stage: ${stageStatus}`);
          
          if (stageStatus === "success") {
            console.log("[Cloudflare] Deployment successful:", deploy.url);
            return statusData;
          }
          if (stageStatus === "failure" || stageStatus === "failed") {
            throw new Error(`Cloudflare deployment failed during deploy stage`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      console.log("[Cloudflare] Polling timed out, returning last known data");
      return deployData;
    } catch (e) {
      console.error("[Cloudflare] 4-Step Upload Error:", e);
      throw e;
    }
  }

  async getDeploymentStatus(projectName: string, deploymentId: string) {
    const res = await fetch(`${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`, {
      headers: this.headers,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result;
  }
}
