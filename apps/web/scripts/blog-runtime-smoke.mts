import path from "node:path";
import dotenv from "dotenv";
import {
  buildDeployedBlogRuntimeFiles,
  resolveBlogD1BindingConfig,
} from "../lib/deployed-blog-runtime.ts";
import { buildDeployedBlogSnapshotFiles } from "../lib/deployed-blog-snapshot.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

function hasEnv(name: string) {
  return Boolean(String(process.env[name] || "").trim());
}

function safeProjectName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url: string, attempts = 10): Promise<{ ok: boolean; status: number; body: any }> {
  let lastStatus = 0;
  let lastBody: any = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "shpitto-blog-runtime-smoke/1.0" },
      });
      lastStatus = res.status;
      const text = await res.text();
      try {
        lastBody = JSON.parse(text);
      } catch {
        lastBody = { text };
      }
      if (res.ok && lastBody?.ok === true) {
        return { ok: true, status: res.status, body: lastBody };
      }
    } catch (error) {
      lastBody = { error: String((error as Error)?.message || error || "fetch failed") };
    }
    await sleep(Math.min(10_000, 1500 * attempt));
  }
  return { ok: false, status: lastStatus, body: lastBody };
}

async function fetchTextWithRetry(url: string, predicate: (text: string, status: number) => boolean, attempts = 10) {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "shpitto-blog-runtime-smoke/1.0" },
      });
      lastStatus = res.status;
      lastText = await res.text();
      if (predicate(lastText, res.status)) {
        return { passed: true, status: res.status, text: lastText };
      }
    } catch (error) {
      lastText = String((error as Error)?.message || error || "fetch failed");
    }
    await sleep(Math.min(10_000, 1500 * attempt));
  }
  return { passed: false, status: lastStatus, text: lastText };
}

async function runLiveDeploymentSmoke() {
  const { CloudflareClient } = await import("../lib/cloudflare.ts");
  const { Bundler } = await import("../lib/bundler.ts");
  const projectName = safeProjectName(`shpitto-blog-smoke-${Date.now().toString(36)}`);
  const cf = new CloudflareClient();
  const snapshotFiles = buildDeployedBlogSnapshotFiles({
    projectId: "shpitto-blog-smoke-project",
    posts: [],
    settings: null,
  });
  const project = {
    staticSite: {
      mode: "skill-direct",
      files: [
        {
          path: "/index.html",
          type: "text/html",
          content: "<!doctype html><html><body>Shpitto Blog runtime smoke</body></html>",
        },
        {
          path: "/blog/index.html",
          type: "text/html",
          content:
            '<!doctype html><html lang="zh-CN"><head><title>博客</title><link rel="stylesheet" href="/styles.css"></head><body><h1>博客</h1></body></html>',
        },
        { path: "/styles.css", type: "text/css", content: "body{font-family:serif}" },
        ...snapshotFiles,
      ],
    },
  };

  let created = false;
  try {
    await cf.createProject(projectName);
    created = true;
    await cf.uploadDeployment(projectName, await Bundler.createBundle(project));
    const url = `https://${projectName}.pages.dev/blog/`;
    const result = await fetchTextWithRetry(
      url,
      (text, status) => status === 200 && text.includes("<h1>博客</h1>"),
    );
    return {
      projectName,
      passed: result.passed,
      detail: result.passed
        ? "Temporary Pages deployment served the generated Blog page without snapshot override."
        : `Temporary Pages deployment did not serve the generated Blog page (HTTP ${result.status || "unknown"}).`,
    };
  } finally {
    if (created) {
      await cf.deletePagesProject(projectName);
    }
  }
}

async function main() {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
  const binding = resolveBlogD1BindingConfig();
  const runDeploySmoke = String(process.env.SHPITTO_BLOG_RUNTIME_DEPLOY_SMOKE || "").trim() === "1";

  checks.push({
    name: "cloudflare-account-id",
    passed: hasEnv("CLOUDFLARE_ACCOUNT_ID"),
    detail: "CLOUDFLARE_ACCOUNT_ID is required for live D1 API smoke.",
  });
  checks.push({
    name: "cloudflare-api-token",
    passed: hasEnv("CLOUDFLARE_API_TOKEN"),
    detail: "CLOUDFLARE_API_TOKEN is required for live D1 API smoke.",
  });
  checks.push({
    name: "d1-database-id",
    passed: Boolean(binding?.databaseId),
    detail: "CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_D1_DB_ID / D1_DATABASE_ID is required.",
  });

  const worker = buildDeployedBlogRuntimeFiles({
    projectId: "smoke-project",
    d1BindingName: binding?.bindingName || "DB",
  }).find((file) => file.path === "/_worker.js")?.content;

  try {
    const mod = await import(`data:text/javascript;base64,${Buffer.from(String(worker || "")).toString("base64")}`);
    checks.push({
      name: "worker-module-syntax",
      passed: typeof mod.default?.fetch === "function",
      detail: "Injected Pages _worker.js must be importable as a module worker.",
    });
  } catch (error) {
    checks.push({
      name: "worker-module-syntax",
      passed: false,
      detail: String((error as Error)?.message || error || "Worker module import failed."),
    });
  }

  if (checks.slice(0, 3).every((check) => check.passed)) {
    try {
      const { getD1Client } = await import("../lib/d1.ts");
      const rows = await getD1Client().query<{ ok: number }>("SELECT 1 AS ok;");
      checks.push({
        name: "live-d1-query",
        passed: Number(rows?.[0]?.ok || 0) === 1,
        detail: "Read-only D1 query returned successfully.",
      });
      if (runDeploySmoke) {
        await getD1Client().ensureShpittoSchema();
        const blogRows = await getD1Client().query<{ count: number }>(
          "SELECT COUNT(*) AS count FROM shpitto_blog_posts WHERE project_id = ?;",
          ["shpitto-blog-smoke-project"],
        );
        checks.push({
          name: "live-blog-table-query",
          passed: Number(blogRows?.[0]?.count ?? 0) >= 0,
          detail: "D1 blog tables are present after schema readiness check.",
        });
      }
    } catch (error) {
      checks.push({
        name: "live-d1-query",
        passed: false,
        detail: String((error as Error)?.message || error || "D1 query failed."),
      });
    }
  } else {
    checks.push({
      name: "live-d1-query",
      passed: false,
      detail: "Skipped because one or more required Cloudflare/D1 env vars are not configured.",
    });
  }

  if (runDeploySmoke) {
    if (checks.slice(0, 3).every((check) => check.passed) && binding) {
      try {
        const result = await runLiveDeploymentSmoke();
        checks.push({
          name: "live-pages-blog-snapshot",
          passed: result.passed,
          detail: `${result.detail} Temporary project: ${result.projectName}.`,
        });
      } catch (error) {
        checks.push({
          name: "live-pages-blog-snapshot",
          passed: false,
          detail: String((error as Error)?.message || error || "Live Pages+D1 runtime smoke failed."),
        });
      }
    } else {
      checks.push({
        name: "live-pages-blog-snapshot",
        passed: false,
        detail: "Skipped because Cloudflare/D1 env vars are not configured.",
      });
    }
  }

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  if (!checks.every((check) => check.passed)) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(`FAIL blog-runtime-smoke: ${String((error as Error)?.message || error || "unknown error")}`);
  process.exitCode = 1;
});
