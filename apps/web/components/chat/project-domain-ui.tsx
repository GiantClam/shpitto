"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Globe2, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";

const DOMAIN_CACHE_KEY_PREFIX = "shpitto:project-domains:";

type DomainLocale = "zh" | "en";

export type ProjectDomainRecord = {
  id: string;
  projectId: string;
  hostname: string;
  status: string;
  customHostnameId?: string | null;
  sslStatus?: string | null;
  originHost?: string | null;
  verificationErrors?: unknown[] | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectDomainApiResponse = {
  ok: boolean;
  project?: {
    projectId: string;
    projectName: string;
    deploymentHost: string | null;
    latestDeploymentUrl: string | null;
  } | null;
  domains?: ProjectDomainRecord[];
  domain?: ProjectDomainRecord | null;
  dns?: {
    type: string;
    host: string;
    fqdn?: string;
    target: string;
  } | null;
  warning?: string;
  warnings?: string[];
  error?: string;
};

type DomainCacheEntry = {
  domains: ProjectDomainRecord[];
  project: ProjectDomainApiResponse["project"] | null;
  warning: string;
};

type CloudflareDnsRow = {
  key: string;
  type: string;
  name: string;
  value: string;
  ttl: string;
  note: string;
};

type GenericDnsRow = {
  key: string;
  type: string;
  host: string;
  value: string;
  ttl: string;
  note: string;
};

type ProviderDnsGroup =
  | {
      key: string;
      title: string;
      hint: string;
      providerStyle: "cloudflare";
      rows: CloudflareDnsRow[];
    }
  | {
      key: string;
      title: string;
      hint: string;
      providerStyle: "generic";
      rows: GenericDnsRow[];
    };

function detectMessageLocale(text: unknown): DomainLocale {
  return /[\u4e00-\u9fff]/.test(String(text || "")) ? "zh" : "en";
}

function localeFromMetadata(metadata?: Record<string, unknown> | null, fallbackText?: unknown): DomainLocale {
  const explicit = String(metadata?.locale || metadata?.displayLocale || "").trim().toLowerCase();
  if (explicit === "zh" || explicit === "zh-cn" || explicit === "zh-hans") return "zh";
  if (explicit === "en" || explicit === "en-us") return "en";
  return detectMessageLocale(fallbackText);
}

export function normalizeHostnameInput(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function isValidHostnameInput(value: string): boolean {
  const normalized = normalizeHostnameInput(value);
  if (!normalized || normalized.length > 253) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalized);
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = String(text || "").split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-[color-mix(in_oklab,var(--shp-bg)_74%,black_26%)] px-1 py-0.5 font-mono text-[0.92em] text-[var(--shp-primary-soft)]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-[var(--shp-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function domainCacheKey(projectId: string) {
  return `${DOMAIN_CACHE_KEY_PREFIX}${projectId}`;
}

function readDomainCache(projectId: string): DomainCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(domainCacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DomainCacheEntry;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
      project: parsed.project || null,
      warning: String(parsed.warning || ""),
    };
  } catch {
    return null;
  }
}

function writeDomainCache(projectId: string, entry: DomainCacheEntry) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(domainCacheKey(projectId), JSON.stringify(entry));
  } catch {
    // ignore cache write failures
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function domainStatusTone(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active" || normalized === "verified") {
    return "border-[color-mix(in_oklab,var(--shp-primary)_34%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] text-[var(--shp-primary-pressed)]";
  }
  if (normalized === "degraded" || normalized === "error" || normalized === "failed") {
    return "border-rose-400/35 bg-rose-500/12 text-rose-700";
  }
  return "border-[color-mix(in_oklab,var(--shp-secondary)_34%,transparent)] bg-[color-mix(in_oklab,var(--shp-secondary)_14%,var(--shp-surface)_86%)] text-[var(--shp-hot)]";
}

function domainStatusLabel(status: string, locale: DomainLocale): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active" || normalized === "verified") return locale === "zh" ? "已生效" : "Active";
  if (normalized === "pending") return locale === "zh" ? "等待验证" : "Pending";
  if (normalized === "initializing") return locale === "zh" ? "初始化中" : "Initializing";
  if (normalized === "degraded") return locale === "zh" ? "异常" : "Degraded";
  if (normalized === "error" || normalized === "failed") return locale === "zh" ? "失败" : "Failed";
  return normalized || (locale === "zh" ? "处理中" : "Processing");
}

type DomainGuidanceMetadataParams = {
  locale: DomainLocale;
  deploymentHost: string;
  deployedUrl?: string;
  hostname?: string;
};

function hostFromUrl(value: string): string {
  try {
    return new URL(String(value || "").trim()).host.toLowerCase();
  } catch {
    return "";
  }
}

function resolvePagesDeploymentHost(metadata: Record<string, unknown>): string {
  const deploymentHost = normalizeHostnameInput(String(metadata.deploymentHost || ""));
  if (deploymentHost.endsWith(".pages.dev")) return deploymentHost;
  const deployedHost = hostFromUrl(String(metadata.deployedUrl || ""));
  if (deployedHost.endsWith(".pages.dev")) return deployedHost;
  return deploymentHost || deployedHost;
}

export function buildDomainGuidanceCardMetadata(params: DomainGuidanceMetadataParams): Record<string, unknown> {
  const locale = params.locale === "zh" ? "zh" : "en";
  const deploymentHost = normalizeHostnameInput(params.deploymentHost);
  const hostname = normalizeHostnameInput(params.hostname || "");
  const deployedUrl = String(params.deployedUrl || "").trim();
  const ttl = locale === "zh" ? "自动 / 默认" : "Auto / Default";
  const dnsTarget = deploymentHost;
  return {
    cardType: "domain_guidance",
    locale,
    title: locale === "zh" ? "域名配置指导" : "Domain Configuration Guide",
    summary:
      locale === "zh"
        ? hostname
          ? `已为 ${hostname} 创建绑定。按下面的 DNS 记录配置后，再回到这里刷新状态。`
          : "提交域名后，按下面的 DNS 记录完成配置并刷新状态。"
        : hostname
          ? `Binding started for ${hostname}. Configure the DNS records below, then return here to refresh the status.`
          : "After submitting the domain, configure the DNS records below and return here to refresh the status.",
    domainEntry: locale === "zh" ? "项目设置 / 域名绑定" : "Project settings / Domain binding",
    propagation:
      locale === "zh"
        ? "通常几分钟生效，最长可能需要 24 小时。"
        : "Usually active within minutes; some DNS providers can take up to 24 hours.",
    deployedUrl,
    deploymentHost,
    hostname,
    steps:
      locale === "zh"
        ? [
            "在域名 DNS 管理后台新增记录。",
            "如果配置 `www.example.com`，使用 `www` 这条记录；如果配置根域名，使用 `@`。",
            "保存 DNS 后等待生效，再回到项目设置刷新域名状态。",
            "域名 Active 后，重新检查登录、注册和找回密码页面。",
          ]
        : [
            "Add a new record in your domain DNS settings.",
            "For `www.example.com`, use the `www` record below. For an apex domain, use `@`.",
            "After saving DNS, wait for propagation and then refresh the domain status in project settings.",
            "Once the domain is active, recheck login, registration, and password recovery pages.",
          ],
    verificationChecklist:
      locale === "zh"
        ? [
            "DNS 记录类型、主机记录和值与卡片一致。",
            "域名状态显示为 Active 或已验证。",
            "HTTPS 可正常打开，自定义域名没有浏览器安全警告。",
          ]
        : [
            "The DNS record type, host, and value match this card.",
            "The domain status shows active or verified.",
            "HTTPS opens without a browser security warning on the custom domain.",
          ],
    tips:
      locale === "zh"
        ? [
            "Cloudflare DNS 使用 `仅 DNS`，不要开启代理。",
            "非 Cloudflare 服务商默认优先使用 `www` 或其他子域名；根域名仅在支持 ALIAS、ANAME 或 Flattening 时使用。",
          ]
        : [
            "With Cloudflare DNS, keep the record in DNS only mode.",
            "For non-Cloudflare DNS providers, prefer `www` or another subdomain. Only use the apex if ALIAS, ANAME, or flattening is supported.",
          ],
    dnsRecords: dnsTarget
      ? [
          {
            type: "CNAME",
            host: "www",
            value: dnsTarget,
            ttl,
            note: locale === "zh" ? "默认推荐；主机记录填 www" : "Recommended default; set host to www",
          },
          {
            type: "CNAME",
            host: "@",
            value: dnsTarget,
            ttl,
            note:
              locale === "zh"
                ? "Cloudflare 可直接使用；其他 DNS 服务商仅在支持 Flattening 时使用"
                : "Use directly on Cloudflare; on other DNS providers only if flattening is supported",
          },
        ]
      : [],
  };
}

export function normalizeDomainGuidanceMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const deploymentHost = resolvePagesDeploymentHost(metadata);
  if (!deploymentHost) return metadata;
  const locale = localeFromMetadata(metadata);
  const normalized = buildDomainGuidanceCardMetadata({
    locale,
    deploymentHost,
    deployedUrl: String(metadata.deployedUrl || "").trim(),
    hostname: normalizeHostnameInput(String(metadata.hostname || "")),
  });
  return {
    ...metadata,
    ...normalized,
    deployedUrl: String(metadata.deployedUrl || normalized.deployedUrl || "").trim(),
    deploymentHost,
  };
}

export function DomainBindingPromptCard(params: {
  projectId: string;
  metadata: Record<string, unknown>;
  disabled: boolean;
}) {
  const locale = localeFromMetadata(params.metadata);
  const title = String(params.metadata.title || (locale === "zh" ? "绑定自定义域名" : "Bind a Custom Domain")).trim();
  const summary = String(
    params.metadata.summary ||
      (locale === "zh"
        ? "部署完成后，还需要先提交并绑定你的域名，系统才会给出对应的 DNS 配置。"
        : "After deployment, submit the domain you want to use first. The app will then show the exact DNS configuration."),
  ).trim();
  const steps = asStringList(params.metadata.steps);
  const copy =
    locale === "zh"
      ? {
          inputLabel: "自定义域名",
          inputPlaceholder: "例如 snapsclean.com 或 www.snapsclean.com",
          submit: "提交并绑定域名",
          submitting: "提交中...",
          saveChanges: "保存域名修改",
          savingChanges: "保存中...",
          refresh: "刷新状态",
          status: "状态",
          sslStatus: "验证 / 证书",
          origin: "DNS 目标",
          noDomains: "还没有提交域名。先在这里填写并提交。",
          inputHint: "支持根域名 example.com 或 www.example.com，提交后会直接展示对应 DNS 记录。",
          invalidHostname: "域名格式不正确，请检查后重试。",
          missingHostname: "请先填写域名。",
          warning: "系统提示",
          errors: "验证信息",
          useDomain: "使用这个域名",
          editDomain: "修改域名",
          deleteDomain: "删除域名",
          deleting: "删除中...",
          cancelEdit: "取消修改",
          editingBadge: "正在修改",
          confirmDelete: "确定删除这个域名绑定吗？删除后需要重新添加并重新校验。",
          listTitle: "已绑定域名",
        }
      : {
          inputLabel: "Custom domain",
          inputPlaceholder: "For example: snapsclean.com or www.snapsclean.com",
          submit: "Submit and Bind Domain",
          submitting: "Submitting...",
          saveChanges: "Save Domain Changes",
          savingChanges: "Saving...",
          refresh: "Refresh status",
          status: "Status",
          sslStatus: "Verification / cert",
          origin: "DNS target",
          noDomains: "No domain has been submitted yet. Enter one here to start binding.",
          inputHint: "Use an apex domain such as example.com or a host like www.example.com. The DNS card will appear right after submission.",
          invalidHostname: "The domain format looks invalid. Please check it and try again.",
          missingHostname: "Please enter a domain first.",
          warning: "System warning",
          errors: "Verification details",
          useDomain: "Use this domain",
          editDomain: "Edit",
          deleteDomain: "Delete",
          deleting: "Deleting...",
          cancelEdit: "Cancel",
          editingBadge: "Editing",
          confirmDelete: "Delete this bound domain? You will need to add and verify it again afterwards.",
          listTitle: "Bound domains",
        };

  const [hostnameInput, setHostnameInput] = useState("");
  const [editingHostname, setEditingHostname] = useState("");
  const [deletingHostname, setDeletingHostname] = useState("");
  const [domains, setDomains] = useState<ProjectDomainRecord[]>(() => readDomainCache(params.projectId)?.domains || []);
  const [projectSummary, setProjectSummary] = useState<ProjectDomainApiResponse["project"] | null>(() => readDomainCache(params.projectId)?.project || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState(() => readDomainCache(params.projectId)?.warning || "");

  const deployedUrl = String(params.metadata.deployedUrl || projectSummary?.latestDeploymentUrl || "").trim();
  const deploymentHost = normalizeHostnameInput(String(params.metadata.deploymentHost || projectSummary?.deploymentHost || "").trim());

  const loadDomains = useCallback(
    async (options?: { preserveInput?: boolean; refreshRemote?: boolean }) => {
      setLoading(true);
      setError("");
      try {
        const paramsText = options?.refreshRemote ? "?refresh=1" : "";
        const res = await fetch(`/api/projects/${encodeURIComponent(params.projectId)}/domains${paramsText}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as ProjectDomainApiResponse;
        if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load domain configuration.");
        const nextDomains = Array.isArray(data.domains) ? data.domains : [];
        setDomains(nextDomains);
        setProjectSummary(data.project || null);
        const nextWarning = String(data.warning || "").trim();
        setWarning(nextWarning);
        writeDomainCache(params.projectId, {
          domains: nextDomains,
          project: data.project || null,
          warning: nextWarning,
        });
        if (!options?.preserveInput) {
          const suggested = normalizeHostnameInput(nextDomains[0]?.hostname || "");
          setHostnameInput((prev) => normalizeHostnameInput(prev) || suggested);
        }
      } catch (loadError: any) {
        setError(String(loadError?.message || loadError || "Failed to load domain configuration."));
      } finally {
        setLoading(false);
      }
    },
    [params.projectId],
  );

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const activeDomain = useMemo(() => {
    const normalizedInput = normalizeHostnameInput(hostnameInput);
    return domains.find((item) => normalizeHostnameInput(item.hostname) === normalizedInput) || domains[0] || null;
  }, [domains, hostnameInput]);

  const guidanceMetadata = useMemo(() => {
    if (!deploymentHost || !activeDomain?.hostname) return null;
    return buildDomainGuidanceCardMetadata({
      locale,
      deploymentHost,
      deployedUrl,
      hostname: activeDomain.hostname,
    });
  }, [activeDomain?.hostname, deployedUrl, deploymentHost, locale]);

  const handleSubmit = useCallback(async () => {
    const hostname = normalizeHostnameInput(hostnameInput);
    if (!hostname) {
      setError(copy.missingHostname);
      return;
    }
    if (!isValidHostnameInput(hostname)) {
      setError(copy.invalidHostname);
      return;
    }
    setSaving(true);
    setError("");
    setWarning("");
    try {
      const method = editingHostname ? "PATCH" : "POST";
      const body = editingHostname ? { currentHostname: editingHostname, hostname } : { hostname };
      const res = await fetch(`/api/projects/${encodeURIComponent(params.projectId)}/domains`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as ProjectDomainApiResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to save domain configuration.");
      const nextDomains = Array.isArray(data.domains) ? data.domains : [];
      setDomains(nextDomains);
      setProjectSummary(data.project || null);
      setHostnameInput(hostname);
      setEditingHostname("");
      const nextWarning = String(data.warning || "").trim();
      setWarning(nextWarning);
      writeDomainCache(params.projectId, {
        domains: nextDomains,
        project: data.project || null,
        warning: nextWarning,
      });
    } catch (submitError: any) {
      setError(String(submitError?.message || submitError || "Failed to save domain configuration."));
    } finally {
      setSaving(false);
    }
  }, [copy.invalidHostname, copy.missingHostname, editingHostname, hostnameInput, params.projectId]);

  const handleDelete = useCallback(
    async (hostname: string) => {
      const normalized = normalizeHostnameInput(hostname);
      if (!normalized) return;
      if (typeof window !== "undefined" && !window.confirm(copy.confirmDelete)) return;
      setDeletingHostname(normalized);
      setError("");
      setWarning("");
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(params.projectId)}/domains`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostname: normalized }),
        });
        const data = (await res.json().catch(() => ({}))) as ProjectDomainApiResponse;
        if (!res.ok || !data.ok) throw new Error(data.error || "Failed to delete domain configuration.");
        const nextDomains = Array.isArray(data.domains) ? data.domains : [];
        setDomains(nextDomains);
        setProjectSummary(data.project || null);
        const nextWarning = String(data.warning || "").trim();
        setWarning(nextWarning);
        writeDomainCache(params.projectId, {
          domains: nextDomains,
          project: data.project || null,
          warning: nextWarning,
        });
        if (editingHostname === normalized) {
          setEditingHostname("");
        }
        if (normalizeHostnameInput(hostnameInput) === normalized) {
          setHostnameInput(normalizeHostnameInput(nextDomains[0]?.hostname || ""));
        }
      } catch (deleteError: any) {
        setError(String(deleteError?.message || deleteError || "Failed to delete domain configuration."));
      } finally {
        setDeletingHostname("");
      }
    },
    [copy.confirmDelete, editingHostname, hostnameInput, params.projectId],
  );

  const submitLabel = editingHostname ? copy.saveChanges : copy.submit;
  const submittingLabel = editingHostname ? copy.savingChanges : copy.submitting;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--shp-secondary)_34%,var(--shp-border)_66%)] bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--shp-secondary)_16%,transparent),transparent_46%),color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] shadow-[0_18px_60px_color-mix(in_oklab,var(--shp-secondary)_10%,transparent)]">
      <div className="flex items-start gap-3 border-b border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_oklab,var(--shp-secondary)_30%,transparent)] bg-[color-mix(in_oklab,var(--shp-secondary)_12%,var(--shp-surface)_88%)] text-[var(--shp-warm)]">
          <Globe2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--shp-text)]">{title}</p>
            {editingHostname ? (
              <span className="inline-flex rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_34%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,var(--shp-surface)_90%)] px-2 py-0.5 text-[10px] font-medium text-[var(--shp-primary-pressed)]">
                {copy.editingBadge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--shp-muted)]">{summary}</p>
          {deployedUrl ? (
            <a href={deployedUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-[var(--shp-primary)] hover:underline" title={deployedUrl}>
              {deployedUrl}
            </a>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {steps.length > 0 ? (
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-xs leading-relaxed text-[var(--shp-muted)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--shp-secondary)_14%,transparent)] text-[10px] font-semibold text-[var(--shp-warm)]">
                  {index + 1}
                </span>
                <span className="pt-0.5">{renderInlineMarkdown(step)}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_94%,var(--shp-bg)_6%)] p-3">
          <label className="block text-xs font-semibold text-[var(--shp-text)]">{copy.inputLabel}</label>
          <input
            value={hostnameInput}
            onChange={(event) => setHostnameInput(normalizeHostnameInput(event.target.value))}
            placeholder={copy.inputPlaceholder}
            className="mt-2 h-11 w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_48%,transparent)] px-3 text-sm text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)]"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--shp-muted)]">{copy.inputHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={params.disabled || saving}
              className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_55%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-xs font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
              <span>{saving ? submittingLabel : submitLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => void loadDomains({ preserveInput: true, refreshRemote: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_88%,var(--shp-bg)_12%)] hover:text-[var(--shp-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>{copy.refresh}</span>
            </button>
            {editingHostname ? (
              <button
                type="button"
                onClick={() => {
                  setEditingHostname("");
                  setHostnameInput(normalizeHostnameInput(activeDomain?.hostname || ""));
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_88%,var(--shp-bg)_12%)] hover:text-[var(--shp-text)]"
              >
                <X className="h-3.5 w-3.5" />
                <span>{copy.cancelEdit}</span>
              </button>
            ) : null}
          </div>
          {error ? <p className="mt-3 text-xs text-rose-700">{error}</p> : null}
          {warning ? (
            <div className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--shp-secondary)_38%,transparent)] bg-[color-mix(in_oklab,var(--shp-secondary)_10%,var(--shp-bg)_90%)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--shp-muted)]">{copy.warning}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--shp-muted)]">{warning}</p>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--shp-muted)]">{copy.listTitle}</p>
            {domains.length === 0 ? (
              <p className="text-xs leading-relaxed text-[var(--shp-muted)]">{copy.noDomains}</p>
            ) : (
              domains.map((domain) => {
                const normalizedHostname = normalizeHostnameInput(domain.hostname);
                const isDeleting = deletingHostname === normalizedHostname;
                return (
                  <div
                    key={domain.id || domain.hostname}
                    className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_42%,transparent)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--shp-text)]">{domain.hostname}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${domainStatusTone(domain.status)}`}>
                            {copy.status}: {domainStatusLabel(domain.status, locale)}
                          </span>
                          {domain.sslStatus ? (
                            <span className="inline-flex rounded-full border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] px-2 py-1 text-[10px] text-[var(--shp-muted)]">
                              {copy.sslStatus}: {domain.sslStatus}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-[var(--shp-muted)]">
                          {copy.origin}: {normalizeHostnameInput(domain.originHost || deploymentHost || "-") || "-"}
                        </p>
                        {Array.isArray(domain.verificationErrors) && domain.verificationErrors.length > 0 ? (
                          <div className="mt-2 rounded-lg border border-rose-300/60 bg-rose-500/8 p-2">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-rose-700">{copy.errors}</p>
                            <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-rose-700">
                              {domain.verificationErrors.map((item, index) => (
                                <li key={`${domain.hostname}-${index}`}>{String(item || "").trim()}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setHostnameInput(domain.hostname)}
                          className="rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)] hover:text-[var(--shp-text)]"
                        >
                          {copy.useDomain}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingHostname(domain.hostname);
                            setHostnameInput(domain.hostname);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-1 text-[11px] text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)] hover:text-[var(--shp-text)]"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>{copy.editDomain}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(domain.hostname)}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-300/60 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          <span>{isDeleting ? copy.deleting : copy.deleteDomain}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        {guidanceMetadata ? <DomainGuidanceCard metadata={guidanceMetadata} /> : null}
      </div>
    </div>
  );
}

export function DomainGuidanceCard({ metadata }: { metadata: Record<string, unknown> }) {
  const locale = localeFromMetadata(metadata);
  const copy =
    locale === "zh"
      ? {
          title: "域名配置指导",
          subtitle: "按下面的信息到域名 DNS 后台添加记录，然后回到项目里校验域名状态。",
          currentDeployment: "当前发布地址与推荐 DNS",
          configurationEntry: "配置入口",
          cloudflareDns: "Cloudflare DNS",
          otherDnsProviders: "其他 DNS 服务商",
          providerSplitHint: "按你的 DNS 服务商选择对应配置方式。Cloudflare 可直接配置根域名；其他 DNS 服务商默认优先使用 www，根域名仅在支持 ALIAS、ANAME 或 Flattening 时使用。",
          name: "名称",
          content: "内容",
          cloudflareHint: "Cloudflare 支持根域名 CNAME Flattening，`@` 可以直接指向下面的真实目标值；代理方式请选择“仅 DNS”。",
          otherDnsHint: "非 Cloudflare 服务商默认优先配置 `www` 或其他子域名。只有当 DNS 服务商明确支持 ALIAS、ANAME 或等效 Flattening 时，才配置根域名 `@`。",
          rootDomainHostNote: "仅在服务商支持 ALIAS、ANAME 或 Flattening 时使用；主机记录填 @",
          wwwHostNote: "默认推荐；主机记录填 www",
          subdomainHostNote: "适用于 blog.example.com 这类子域名；主机记录填 blog、app 等前缀",
          recordType: "类型",
          host: "主机记录",
          value: "记录值",
          ttl: "TTL",
          copy: "复制",
          copied: "已复制",
          steps: "配置步骤",
          verificationChecklist: "生效检查",
          tips: "注意事项",
          propagation: "预计生效时间",
          openSite: "打开站点",
        }
      : {
          title: "Domain Configuration Guide",
          subtitle: "Add the DNS records below in your domain provider, then return to the project to verify the domain.",
          currentDeployment: "Current deployment and DNS",
          configurationEntry: "Configuration entry",
          cloudflareDns: "Cloudflare DNS",
          otherDnsProviders: "Other DNS providers",
          providerSplitHint: "Choose the matching provider section below. Cloudflare can use the apex directly; other DNS providers should prefer www by default, and only use the apex if ALIAS, ANAME, or flattening is supported.",
          name: "Name",
          content: "Content",
          cloudflareHint: "Cloudflare supports apex CNAME flattening, so `@` can point directly to the real target value below. Set proxy mode to DNS only.",
          otherDnsHint: "For non-Cloudflare DNS providers, prefer `www` or another subdomain by default. Only use the apex if the provider explicitly supports ALIAS, ANAME, or equivalent flattening.",
          rootDomainHostNote: "Use only when the provider supports ALIAS, ANAME, or flattening; set host to @",
          wwwHostNote: "Recommended default; set host to www",
          subdomainHostNote: "Use for subdomains such as blog.example.com; set host to a prefix like blog or app",
          recordType: "Type",
          host: "Host",
          value: "Value",
          ttl: "TTL",
          copy: "Copy",
          copied: "Copied",
          steps: "Setup steps",
          verificationChecklist: "Activation checklist",
          tips: "Notes",
          propagation: "Estimated propagation",
          openSite: "Open site",
        };
  const [copiedKey, setCopiedKey] = useState("");
  const title = String(metadata.title || copy.title);
  const summary = String(metadata.summary || copy.subtitle).trim();
  const propagation = String(metadata.propagation || "").trim();
  const deployedUrl = String(metadata.deployedUrl || "").trim();
  const deploymentHost = String(metadata.deploymentHost || "").trim();
  const dnsRecords = (Array.isArray(metadata.dnsRecords) ? metadata.dnsRecords : [])
    .map((item) => asRecord(item))
    .map((item) => ({
      type: String(item.type || "").trim(),
      host: String(item.host || "").trim(),
      value: String(item.value || item.target || "").trim(),
      ttl: String(item.ttl || "").trim(),
      note: String(item.note || "").trim(),
    }))
    .filter((item) => item.type && item.host && item.value);
  const visibleDnsRecords =
    dnsRecords.length > 0
      ? dnsRecords
      : deploymentHost
        ? [
            {
              type: "CNAME",
              host: "www",
              value: deploymentHost,
              ttl: locale === "zh" ? "自动 / 默认" : "Auto / Default",
              note: locale === "zh" ? "用于 www.example.com 这类子域名。" : "Use for a subdomain such as www.example.com.",
            },
          ]
        : [];
  const dnsTarget =
    visibleDnsRecords.find((record) => record.host === "@")?.value ||
    visibleDnsRecords.find((record) => record.host === "www")?.value ||
    visibleDnsRecords[0]?.value ||
    deploymentHost;
  const defaultTtl = visibleDnsRecords[0]?.ttl || (locale === "zh" ? "自动 / 默认" : "Auto / Default");
  const providerDnsGroups: ProviderDnsGroup[] = dnsTarget
    ? [
        {
          key: "cloudflare",
          title: copy.cloudflareDns,
          hint: copy.cloudflareHint,
          providerStyle: "cloudflare" as const,
          rows: [
            { key: "cloudflare-root", type: "CNAME", name: "@", value: dnsTarget, ttl: defaultTtl, note: copy.rootDomainHostNote },
            { key: "cloudflare-www", type: "CNAME", name: "www", value: dnsTarget, ttl: defaultTtl, note: copy.wwwHostNote },
            { key: "cloudflare-subdomain", type: "CNAME", name: "blog", value: dnsTarget, ttl: defaultTtl, note: copy.subdomainHostNote },
          ],
        },
        {
          key: "other",
          title: copy.otherDnsProviders,
          hint: copy.otherDnsHint,
          providerStyle: "generic" as const,
          rows: [
            { key: "other-www", type: "CNAME", host: "www", value: dnsTarget, ttl: defaultTtl, note: copy.wwwHostNote },
            { key: "other-subdomain", type: "CNAME", host: "blog", value: dnsTarget, ttl: defaultTtl, note: copy.subdomainHostNote },
            { key: "other-root", type: "ALIAS / ANAME / Flattening", host: "@", value: dnsTarget, ttl: defaultTtl, note: copy.rootDomainHostNote },
          ],
        },
      ]
    : [];

  useEffect(() => {
    if (!copiedKey) return undefined;
    const timeoutId = window.setTimeout(() => setCopiedKey(""), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [copiedKey]);

  const handleCopy = useCallback(async (key: string, value: string) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedKey(key);
    } catch {
      setCopiedKey("");
    }
  }, []);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--shp-primary)_28%,var(--shp-border)_72%)] bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--shp-primary)_18%,transparent),transparent_44%),color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] shadow-[0_18px_60px_color-mix(in_oklab,var(--shp-primary)_10%,transparent)]">
      <div className="flex items-start gap-3 border-b border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-4 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_oklab,var(--shp-primary)_34%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] text-[var(--shp-primary)]">
          <Globe2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--shp-text)]">{title}</p>
          {summary ? <p className="mt-1 text-xs leading-relaxed text-[var(--shp-muted)]">{summary}</p> : null}
          {deployedUrl ? (
            <a href={deployedUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-[var(--shp-primary)] hover:underline" title={deployedUrl}>
              {deployedUrl}
            </a>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {providerDnsGroups.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_48%,transparent)]">
            <div className="border-b border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--shp-muted)]">{copy.currentDeployment}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--shp-muted)]">{copy.providerSplitHint}</p>
            </div>
            <div className="space-y-3 px-3 py-3">
              <div className="space-y-3">
                {providerDnsGroups.map((group) => (
                  <div
                    key={group.key}
                    className="overflow-hidden rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_54%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_90%,transparent)]"
                  >
                    <div className="border-b border-[color-mix(in_oklab,var(--shp-border)_50%,transparent)] px-3 py-2">
                      <p className="text-[11px] font-semibold text-[var(--shp-text)]">{group.title}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--shp-muted)]">{group.hint}</p>
                    </div>
                    <div className="divide-y divide-[color-mix(in_oklab,var(--shp-border)_42%,transparent)]">
                      {group.providerStyle === "cloudflare"
                        ? group.rows.map((record) => (
                            <div key={record.key} className="space-y-2 px-3 py-3">
                              <div className="grid gap-2 text-xs md:grid-cols-[60px_60px_minmax(0,1fr)_90px]">
                                <div>
                                  <p className="text-[10px] text-[var(--shp-muted)]">{copy.name}</p>
                                  <code className="mt-1 block font-mono text-[var(--shp-text)]">{record.name}</code>
                                </div>
                                <div>
                                  <p className="text-[10px] text-[var(--shp-muted)]">{copy.recordType}</p>
                                  <code className="mt-1 block font-mono text-[var(--shp-text)]">{record.type}</code>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-[var(--shp-muted)]">{copy.content}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleCopy(`${group.key}-${record.key}-value`, record.value)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-0.5 text-[11px] text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]"
                                    >
                                      {copiedKey === `${group.key}-${record.key}-value` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                      <span>{copiedKey === `${group.key}-${record.key}-value` ? copy.copied : copy.copy}</span>
                                    </button>
                                  </div>
                                  <button type="button" onClick={() => void handleCopy(`${group.key}-${record.key}-value`, record.value)} className="mt-1 block w-full text-left">
                                    <code
                                      className="block h-14 w-full overflow-hidden text-ellipsis rounded-md border border-[color-mix(in_oklab,var(--shp-border)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_44%,transparent)] px-2 py-1.5 font-mono text-[11px] leading-4 text-[var(--shp-text)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
                                      title={record.value}
                                    >
                                      {record.value}
                                    </code>
                                  </button>
                                </div>
                                <div>
                                  <p className="text-[10px] text-[var(--shp-muted)]">{copy.ttl}</p>
                                  <code className="mt-1 block font-mono text-[var(--shp-text)]">{record.ttl || "-"}</code>
                                </div>
                              </div>
                              {record.note ? <p className="text-[11px] leading-relaxed text-[var(--shp-muted)]">{record.note}</p> : null}
                            </div>
                          ))
                        : group.rows.map((record) => (
                            <div key={record.key} className="space-y-2 px-3 py-3">
                              <div className="grid gap-2 text-xs md:grid-cols-[60px_60px_minmax(0,1fr)_100px]">
                                <div>
                                  <p className="text-[10px] text-[var(--shp-muted)]">{copy.host}</p>
                                  <code className="mt-1 block font-mono text-[var(--shp-text)]">{record.host}</code>
                                </div>
                                <div>
                                  <p className="text-[10px] text-[var(--shp-muted)]">{copy.recordType}</p>
                                  <code className="mt-1 block font-mono text-[var(--shp-text)]">{record.type}</code>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-[var(--shp-muted)]">{copy.value}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleCopy(`${group.key}-${record.key}-value`, record.value)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] px-2 py-0.5 text-[11px] text-[var(--shp-muted)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_10%,transparent)]"
                                    >
                                      {copiedKey === `${group.key}-${record.key}-value` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                      <span>{copiedKey === `${group.key}-${record.key}-value` ? copy.copied : copy.copy}</span>
                                    </button>
                                  </div>
                                  <button type="button" onClick={() => void handleCopy(`${group.key}-${record.key}-value`, record.value)} className="mt-1 block w-full text-left">
                                    <code
                                      className="block h-14 w-full overflow-hidden text-ellipsis rounded-md border border-[color-mix(in_oklab,var(--shp-border)_46%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_44%,transparent)] px-2 py-1.5 font-mono text-[11px] leading-4 text-[var(--shp-text)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
                                      title={record.value}
                                    >
                                      {record.value}
                                    </code>
                                  </button>
                                </div>
                                <div>
                                  <p className="text-[10px] text-[var(--shp-muted)]">{copy.ttl}</p>
                                  <code className="mt-1 block font-mono text-[var(--shp-text)]">{record.ttl || "-"}</code>
                                </div>
                              </div>
                              {record.note ? <p className="text-[11px] leading-relaxed text-[var(--shp-muted)]">{record.note}</p> : null}
                            </div>
                          ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {propagation ? (
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_42%,transparent)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--shp-muted)]">{copy.propagation}</p>
              <p className="mt-1 leading-relaxed text-[var(--shp-text)]">{propagation}</p>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {deployedUrl ? (
            <a href={deployedUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[color-mix(in_oklab,var(--shp-primary)_48%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_14%,var(--shp-surface)_86%)] px-3 py-2 text-xs font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-primary)_22%,var(--shp-surface)_78%)]">
              {copy.openSite}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
