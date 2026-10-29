import path from "node:path";
import dotenv from "dotenv";
import { Bundler } from "../lib/bundler.ts";
import { CloudflareClient } from "../lib/cloudflare.ts";
import { deployWithWrangler } from "../lib/cloudflare-pages-wrangler.ts";
import {
  buildDeployedBlogRuntimeFiles,
  resolveBlogD1BindingConfig,
} from "../lib/deployed-blog-runtime.ts";
import { getD1Client } from "../lib/d1.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false, quiet: true });

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

async function fetchTextWithRetry(
  url: string,
  predicate: (text: string, status: number, contentType: string) => boolean,
  attempts = 12,
) {
  let last = { status: 0, text: "", contentType: "" };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "shpitto-blog-runtime-wrangler-smoke/1.0" },
      });
      const text = await res.text();
      last = { status: res.status, text, contentType: res.headers.get("content-type") || "" };
      if (predicate(text, res.status, last.contentType)) return { passed: true, ...last };
    } catch (error) {
      last = { status: 0, text: String((error as Error)?.message || error || "fetch failed"), contentType: "" };
    }
    await sleep(Math.min(10_000, 1500 * attempt));
  }
  return { passed: false, ...last };
}

async function main() {
  const binding = resolveBlogD1BindingConfig();
  const missing = [
    ["CLOUDFLARE_ACCOUNT_ID", process.env.CLOUDFLARE_ACCOUNT_ID],
    ["CLOUDFLARE_API_TOKEN", process.env.CLOUDFLARE_API_TOKEN],
    ["D1 database id", binding?.databaseId],
  ].filter(([, value]) => !String(value || "").trim());
  if (missing.length > 0) {
    for (const [name] of missing) console.log(`FAIL env-${name}: missing`);
    process.exitCode = 1;
    return;
  }

  const projectId = `shpitto-blog-wrangler-smoke-${Date.now().toString(36)}`;
  const projectName = safeProjectName(projectId);
  const cf = new CloudflareClient();
  let created = false;

  try {
    await getD1Client().ensureShpittoSchema();
    await cf.createProject(projectName, binding || undefined);
    created = true;

    const project = {
      staticSite: {
        mode: "skill-direct",
        files: [
          {
            path: "/index.html",
            type: "text/html",
            content: "<!doctype html><html><head><title>Shpitto Wrangler Smoke</title></head><body>ok</body></html>",
          },
          {
            path: "/blog/index.html",
            type: "text/html",
            content:
              '<!doctype html><html lang="zh-CN"><head><title>博客</title><link rel="stylesheet" href="/styles.css"></head><body><h1>博客</h1></body></html>',
          },
          {
            path: "/styles.css",
            type: "text/css",
            content: "body{font-family:serif}",
          },
          ...buildDeployedBlogRuntimeFiles({
            projectId,
            d1BindingName: binding?.bindingName || "DB",
            generatedAt: new Date().toISOString(),
          }),
        ],
      },
    };
    const deploy = await deployWithWrangler({
      taskId: projectId,
      projectName,
      branch: "main",
      bundle: await Bundler.createBundle(project),
    });
    const baseUrl = deploy.productionUrl.replace(/\/+$/g, "");
    const checks = [
      {
        name: "runtime-json",
        result: await fetchTextWithRetry(
          `${baseUrl}/api/blog/posts`,
          (text, status, contentType) => status === 200 && contentType.includes("json") && text.includes('"ok":true'),
        ),
      },
      {
        name: "blog-html",
        result: await fetchTextWithRetry(
          `${baseUrl}/blog/`,
          (text, status, contentType) => status === 200 && contentType.includes("html") && /<body[\s>]/i.test(text),
        ),
      },
      {
        name: "runtime-metadata",
        result: await fetchTextWithRetry(
          `${baseUrl}/shpitto-blog-runtime.json`,
          (text, status, contentType) =>
            status === 200 && contentType.includes("json") && text.includes('"mode": "deployment-d1-runtime"'),
        ),
      },
      {
        name: "rss-xml",
        result: await fetchTextWithRetry(
          `${baseUrl}/blog/rss.xml`,
          (text, status, contentType) => status === 200 && (contentType.includes("xml") || text.includes("<rss")),
        ),
      },
      {
        name: "sitemap-xml",
        result: await fetchTextWithRetry(
          `${baseUrl}/sitemap.xml`,
          (text, status, contentType) => status === 200 && contentType.includes("xml") && text.includes("/blog/"),
        ),
      },
    ];

    for (const check of checks) {
      console.log(
        `${check.result.passed ? "PASS" : "FAIL"} ${check.name}: HTTP ${check.result.status || "unknown"} ${check.result.contentType || ""}`,
      );
    }
    console.log(`PASS wrangler-url: ${deploy.deploymentUrl}`);
    console.log(`PASS production-url: ${deploy.productionUrl}`);

    if (!checks.every((check) => check.result.passed)) process.exitCode = 1;
  } finally {
    if (created) {
      await cf.deletePagesProject(projectName).catch((error) => {
        console.warn(`WARN cleanup: ${String((error as Error)?.message || error || "delete failed")}`);
      });
    }
  }
}

void main().catch((error) => {
  console.error(`FAIL blog-runtime-wrangler-smoke: ${String((error as Error)?.message || error || "unknown error")}`);
  process.exitCode = 1;
});
