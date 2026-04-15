import fs from "fs/promises";
import path from "path";
import { inferNavLabel, resolveStylePresetFromProject } from "./design-style-preset";
import { normalizeComponentType } from "./agent/engine";

export interface BundleResult {
  manifest: Record<string, string>;
  fileEntries: Array<{
    path: string;
    hash: string;
    content: string;
    base64Content: string;
    type: string;
    size: number;
  }>;
}

export class Bundler {
  private static TEXTUAL_FIELD_RE =
    /title|subtitle|description|content|question|answer|label|privacy|cta|name|role|tag|placeholder|value|text/i;
  private static LINK_FIELD_RE = /(link|href|url|path|image|logo)$/i;

  private static normalizeContactFieldType(value: unknown) {
    if (value === "email" || value === "tel" || value === "textarea" || value === "select") return value;
    return "text";
  }

  private static toSafeText(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") {
      const candidateKeys = ["text", "title", "label", "name", "value", "description", "content"];
      for (const key of candidateKeys) {
        const candidate = (value as Record<string, unknown>)[key];
        if (typeof candidate === "string" && candidate.trim()) return candidate;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    }
    return String(value);
  }

  private static sanitizeRenderableValue(value: unknown, keyHint?: string): unknown {
    if (value == null) return value;
    if (typeof value === "string") {
      if (keyHint && this.LINK_FIELD_RE.test(keyHint)) return this.escapeUrl(value, "");
      return this.escapeHtml(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return this.escapeHtml(String(value));
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeRenderableValue(entry, keyHint));
    }
    if (typeof value === "object") {
      if (keyHint && this.TEXTUAL_FIELD_RE.test(keyHint)) {
        return this.escapeHtml(this.toSafeText(value));
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          this.sanitizeRenderableValue(entry, key),
        ]),
      );
    }
    return this.escapeHtml(String(value));
  }

  private static escapeHtml(value: unknown): string {
    const text = this.toSafeText(value);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private static unescapeHtml(value: string): string {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  private static escapeAttr(value: unknown): string {
    return this.escapeHtml(value)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private static escapeUrl(value: unknown, fallback = "#"): string {
    const raw = this.toSafeText(value).trim();
    const next = raw || fallback;
    return this.escapeAttr(next);
  }

  private static hasCjk(text: string): boolean {
    return /[\u4e00-\u9fff]/.test(text);
  }

  private static detectPageLang(page: any): string {
    const samples: string[] = [];
    const push = (value: unknown) => {
      const text = this.toSafeText(value).trim();
      if (text) samples.push(text);
    };

    push(page?.seo?.title);
    push(page?.seo?.description);
    push(page?.seo?.navLabel);
    push(page?.seo?.menuLabel);

    const content = Array.isArray(page?.puckData?.content) ? page.puckData.content : [];
    for (const component of content) {
      push(component?.props?.title);
      push(component?.props?.subtitle);
      push(component?.props?.description);
      push(component?.props?.content);
    }

    const joined = samples.join(" ");
    return this.hasCjk(joined) ? "zh-CN" : "en";
  }

  private static normalizeLucideIconName(value: unknown, fallback = "check"): string {
    const raw = this.toSafeText(value).trim();
    if (!raw) return fallback;

    const candidate = raw
      .replace(/Icon$/i, "")
      .replace(/_/g, "-")
      .replace(/\s+/g, "-")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+|-+$/g, "");

    return candidate || fallback;
  }

  private static sanitizeComponent(component: any) {
    return {
      ...component,
      props: this.sanitizeRenderableValue(component?.props || {}),
    };
  }

  private static sanitizeRawHtml(value: unknown): string {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/^<main[^>]*>/i, "")
      .replace(/<\/main>\s*$/i, "")
      .trim();
  }

  private static normalizeBundlePath(raw: unknown): string {
    const text = this.toSafeText(raw).trim();
    if (!text) return "";
    const withSlash = text.startsWith("/") ? text : `/${text}`;
    const collapsed = withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    return collapsed;
  }

  private static async buildBundleFromFiles(
    files: Array<{ path: string; content: string; type?: string }>
  ): Promise<BundleResult> {
    const manifest: Record<string, string> = {};
    const fileEntries: BundleResult["fileEntries"] = [];
    const crypto = await import("node:crypto");

    for (const file of files) {
      const bundlePath = this.normalizeBundlePath(file.path);
      if (!bundlePath) continue;
      const content = typeof file.content === "string" ? file.content : this.toSafeText(file.content);
      const buffer = Buffer.from(content);
      const base64Content = buffer.toString("base64");
      const hashInput = base64Content + bundlePath;
      const hash = crypto.createHash("md5").update(hashInput).digest("hex");
      manifest[bundlePath] = hash;
      fileEntries.push({
        path: bundlePath,
        hash,
        content,
        base64Content,
        type: file.type || "text/plain",
        size: buffer.length,
      });
    }

    return { manifest, fileEntries };
  }

  private static normalizeContactFields(fields: any[]) {
    const defaults = [
      { name: "name", label: "Name", type: "text", placeholder: "Enter your name", required: true },
      { name: "phone", label: "Phone", type: "tel", placeholder: "Enter your phone number", required: true },
      { name: "email", label: "Email", type: "email", placeholder: "Enter your email", required: false },
      { name: "company", label: "Company", type: "text", placeholder: "Enter your company", required: false },
      { name: "message", label: "Message", type: "textarea", placeholder: "Describe your requirements", required: true },
    ];

    const source = Array.isArray(fields) && fields.length > 0 ? fields : defaults;
    return source.map((field: any, index: number) => {
      const optionsRaw =
        Array.isArray(field?.options)
          ? field.options
          : typeof field?.options === "string"
            ? field.options
                .split(",")
                .map((x: string) => x.trim())
                .filter(Boolean)
            : [];
      const options = optionsRaw
        .map((option: any) =>
          typeof option === "string"
            ? option
            : option?.label || option?.value || option?.title || option?.name || this.toSafeText(option),
        )
        .map((text: string) => this.toSafeText(text).trim())
        .filter(Boolean);

      return {
        name: field?.name || `field_${index + 1}`,
        label: field?.label || `Field ${index + 1}`,
        type: this.normalizeContactFieldType(field?.type),
        placeholder: field?.placeholder || "",
        required: field?.required === true || String(field?.required || "").toLowerCase() === "true",
        options,
      };
    });
  }

  private static renderUnknownComponent(type: string, props: Record<string, any>): string {
    const title = props.title || props.headline || props.name || type;
    const subtitle = props.subtitle || props.description || props.summary || "";
    const listFromItems = Array.isArray(props.items)
      ? props.items
          .map((item: any) =>
            typeof item === "string"
              ? item
              : item?.title || item?.name || item?.label || item?.description || item?.content || "",
          )
          .filter(Boolean)
      : [];
    const lines = listFromItems.length
      ? listFromItems
      : [props.content, props.text, props.body].map((x) => this.toSafeText(x).trim()).filter(Boolean);
    return `
      <section class="py-20 bg-white">
        <div class="container mx-auto px-4 max-w-4xl">
          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-8">
            <h2 class="text-2xl md:text-3xl font-bold mb-3">${title}</h2>
            ${subtitle ? `<p class="text-slate-600 mb-5">${subtitle}</p>` : ""}
            ${lines.length ? `<div class="space-y-2 text-slate-700">${lines.map((line) => `<p>${line}</p>`).join("")}</div>` : ""}
          </article>
        </div>
      </section>`;
  }

  private static normalizePreviewItems(items: any[]): any[] {
    if (!Array.isArray(items)) return [];
    return items
      .map((item: any) => {
        const title = item?.title || item?.name || item?.model || item?.headline || item?.articleTitle || "";
        const specsLine = Array.isArray(item?.specs)
          ? item.specs
              .map((spec: any) =>
                typeof spec === "string" ? spec : [spec?.label, spec?.value].filter(Boolean).join(": "),
              )
              .filter(Boolean)
              .join(" | ")
          : "";
        const applicationsLine = Array.isArray(item?.applications) && item.applications.length > 0
          ? `应用: ${item.applications.join(" / ")}`
          : "";
        const description =
          item?.description || item?.summary || [specsLine, applicationsLine].filter(Boolean).join(" | ");
        return {
          title,
          description,
          tag: item?.tag || item?.category || item?.date || item?.model || "",
          image: item?.image || item?.cover || item?.imageUrl || item?.thumbnail || "",
          href: item?.href || item?.link || item?.url || item?.ctaLink || "",
          ctaText: item?.ctaText || item?.cta || "",
        };
      })
      .filter((item) => item.title || item.description);
  }

  private static renderStructuredContentBlock(content: unknown): string {
    const asText = typeof content === "string" ? this.unescapeHtml(content) : this.toSafeText(content);
    const trimmed = asText.trim();
    let parsed: any = null;

    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = null;
      }
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const columns = Array.isArray(parsed.columns) ? parsed.columns : [];
      if (columns.length > 0) {
        return `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${columns
              .map((column: any) => {
                const title = column?.title || column?.name || "";
                const lines = Array.isArray(column?.lines)
                  ? column.lines.map((line: any) => this.toSafeText(line)).filter(Boolean)
                  : [];
                return `
                  <article class="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    ${title ? `<h3 class="text-lg font-semibold mb-3">${title}</h3>` : ""}
                    ${lines.length ? `<ul class="space-y-2 text-slate-700">${lines.map((line: string) => `<li>${line}</li>`).join("")}</ul>` : ""}
                  </article>
                `;
              })
              .join("")}
          </div>
        `;
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      if (items.length > 0) {
        return `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${items
              .map((item: any) => {
                const title = item?.title || item?.name || item?.label || "";
                const description =
                  item?.description || item?.summary || item?.content || item?.text || "";
                return `
                  <article class="rounded-2xl border border-slate-200 bg-white p-6">
                    ${title ? `<h3 class="text-lg font-semibold mb-2">${title}</h3>` : ""}
                    ${description ? `<p class="text-slate-600">${description}</p>` : ""}
                  </article>
                `;
              })
              .join("")}
          </div>
        `;
      }
    }

    return trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`)
      .join("");
  }

  static async createBundle(config: any): Promise<BundleResult> {
    const staticFiles = Array.isArray(config?.staticSite?.files) ? config.staticSite.files : [];
    if (staticFiles.length > 0) {
      return this.buildBundleFromFiles(
        staticFiles.map((file: any) => ({
          path: file?.path,
          content: file?.content,
          type: file?.type || (String(file?.path || "").endsWith(".html") ? "text/html" : "text/plain"),
        })),
      );
    }

    const pages = config.pages || [];
    const branding = config.branding || {};
    const stylePreset = resolveStylePresetFromProject(config, branding);
    const primaryColor = stylePreset.colors.primary || branding.colors?.primary || "#2563eb";
    const accentColor = stylePreset.colors.accent || branding.colors?.accent || primaryColor;
    const siteName = branding.name || "Shpitto Site";

    const files: Array<{ path: string; content: string; type: string }> = [];

    for (const page of pages) {
      const pagePath = page.path === "/" ? "/index.html" : `${page.path.replace(/^\//, "")}/index.html`;
      const pageTitleRaw = page.seo?.title || `${siteName} - ${page.path}`;
      const pageDescRaw = page.seo?.description || "A professional website generated by Shpitto.";
      const pageTitle = this.escapeHtml(pageTitleRaw);
      const pageDesc = this.escapeAttr(pageDescRaw);
      const pageLang = this.detectPageLang(page);
      
      const content = page.puckData?.content || [];
      const rawHtml = this.sanitizeRawHtml(page?.puckData?.root?.props?.rawHtml);
      const bodyHtml = rawHtml
        ? rawHtml
        : content
            .map((component: any) => this.renderComponent(this.sanitizeComponent(component), branding, stylePreset))
            .join("\n");
      const seoSchema = typeof page.puckData?.root?.props?.seoSchema === "string" ? page.puckData.root.props.seoSchema : "";
      const seoSchemaSafe = seoSchema ? seoSchema.replace(/</g, "\\u003c") : "";
      const seoSchemaTag = seoSchemaSafe ? `<script type="application/ld+json">${seoSchemaSafe}</script>` : "";

      const navLinks = pages.map((p: any) => ({
        label: inferNavLabel(p, stylePreset.navLabelMaxChars),
        fullTitle: inferNavLabel(p, stylePreset.navLabelMaxChars),
        url: p.path === "/" ? "/index.html" : `/${p.path.replace(/^\//, "")}/index.html`
      }));
      const isDark = stylePreset.mode === "dark";
      const bodyBaseClass = isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-slate-900";
      const headerClass =
        stylePreset.headerVariant === "solid"
          ? isDark
            ? "sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800"
            : "sticky top-0 z-50 bg-white border-b border-slate-200"
          : isDark
            ? "sticky top-0 z-50 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/80"
            : "sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm";
      const footerClass =
        stylePreset.footerVariant === "light"
          ? "bg-white text-slate-700 py-20 border-t border-slate-200"
          : isDark
            ? "bg-zinc-950 text-zinc-100 py-20 border-t border-zinc-800"
            : "bg-slate-950 text-white py-20";
      const navActiveClass =
        stylePreset.navVariant === "underline"
          ? "text-primary font-bold border-b-2 border-primary pb-1"
          : "text-primary font-bold bg-primary/10 px-3 py-1 rounded-full";
      const navInactiveClass =
        stylePreset.navVariant === "underline"
          ? "text-slate-600 hover:text-primary border-b-2 border-transparent hover:border-primary/50 pb-1"
          : "text-slate-600 hover:text-primary hover:bg-primary/10 px-3 py-1 rounded-full";
      const ctaClass =
        stylePreset.buttonVariant === "outline"
          ? "border border-primary text-primary px-5 py-2.5 rounded-full text-sm font-bold hover:bg-primary hover:text-white transition-all"
          : "bg-primary text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-lg shadow-primary/25 hover:opacity-90 transition-all";

      const fullHtml = `<!DOCTYPE html>
<html lang="${pageLang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <meta name="description" content="${pageDesc}">
    ${seoSchemaTag}
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '${primaryColor}',
                        accent: '${accentColor}',
                    }
                }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        :root {
          --brand-primary: ${this.escapeAttr(primaryColor)};
          --brand-accent: ${this.escapeAttr(accentColor)};
          --brand-bg: ${this.escapeAttr(stylePreset.colors.background)};
          --brand-surface: ${this.escapeAttr(stylePreset.colors.surface)};
          --brand-panel: ${this.escapeAttr(stylePreset.colors.panel)};
          --brand-text: ${this.escapeAttr(stylePreset.colors.text)};
          --brand-muted: ${this.escapeAttr(stylePreset.colors.muted)};
          --brand-border: ${this.escapeAttr(stylePreset.colors.border)};
        }
        body {
          font-family: ${this.escapeHtml(stylePreset.typography)};
          background: var(--brand-bg);
          color: var(--brand-text);
        }
        [data-style-mode="dark"] .bg-white { background-color: #0a0f1a !important; }
        [data-style-mode="dark"] .bg-slate-50 { background-color: #0f172a !important; }
        [data-style-mode="dark"] .text-slate-900 { color: #f3f4f6 !important; }
        [data-style-mode="dark"] .text-slate-700 { color: #d1d5db !important; }
        [data-style-mode="dark"] .text-slate-600,
        [data-style-mode="dark"] .text-slate-500 { color: #9ca3af !important; }
        [data-style-mode="dark"] .border-slate-100,
        [data-style-mode="dark"] .border-slate-200,
        [data-style-mode="dark"] .border-slate-300 { border-color: #1f2937 !important; }
        [data-style-mode="dark"] .shadow-sm,
        [data-style-mode="dark"] .shadow-xl,
        [data-style-mode="dark"] .shadow-2xl { box-shadow: none !important; }
        .brand-link:hover { color: var(--brand-primary); }
    </style>
</head>
<body data-style-mode="${stylePreset.mode}" class="${bodyBaseClass}">
    <header class="${headerClass}">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <a href="/index.html" class="flex items-center gap-3 hover:opacity-80 transition-opacity brand-link">
                    ${branding.logo ? `<img src="${this.escapeUrl(branding.logo)}" alt="${this.escapeAttr(siteName)} Logo" class="h-10 w-auto">` : `<div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/30">${this.escapeHtml(siteName[0])}</div>`}
                    <span class="font-bold text-xl tracking-tight text-slate-900">${this.escapeHtml(siteName)}</span>
                </a>
            </div>
            <nav class="hidden md:flex min-w-0 items-center gap-2 lg:gap-4">
                ${navLinks.map((link: any) => {
                    const isActive = link.url === (page.path === "/" ? "/index.html" : `/${page.path.replace(/^\//, "")}/index.html`);
                    const hoverTitle = link.fullTitle || link.label;
                    return `<a href="${this.escapeUrl(link.url, "/index.html")}" title="${this.escapeAttr(hoverTitle)}" class="inline-block max-w-[10ch] lg:max-w-[12ch] truncate whitespace-nowrap text-sm font-semibold transition-colors ${isActive ? navActiveClass : navInactiveClass}">${this.escapeHtml(link.label)}</a>`;
                }).join("")}
                <button class="${ctaClass}">Request Quote</button>
            </nav>
        </div>
    </header>

    <main>
        ${bodyHtml}
    </main>

    <footer class="${footerClass}">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-12">
                <div class="col-span-1 md:col-span-2">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl">${this.escapeHtml(siteName[0])}</div>
                        <span class="font-bold text-xl tracking-tight">${this.escapeHtml(siteName)}</span>
                    </div>
                    <p class="text-slate-400 max-w-sm mb-8">${this.escapeHtml(pageDescRaw)}</p>
                </div>
                <div>
                    <h4 class="font-bold mb-6">Navigation</h4>
                    <ul class="space-y-4 text-sm">
                        ${navLinks.map((link: any) => `<li><a href="${this.escapeUrl(link.url, "/index.html")}" class="hover:text-primary transition-colors">${this.escapeHtml(link.label)}</a></li>`).join("")}
                    </ul>
                </div>
                <div>
                    <h4 class="font-bold mb-6">Connect</h4>
                    <ul class="space-y-4 text-sm">
                        <li><a href="#" class="hover:text-primary transition-colors">LinkedIn</a></li>
                        <li><a href="#" class="hover:text-primary transition-colors">Twitter</a></li>
                    </ul>
                </div>
            </div>
            <div class="border-t mt-20 pt-8 text-sm flex justify-between" style="border-color: var(--brand-border); color: var(--brand-muted);">
                <p>&copy; ${new Date().getFullYear()} ${this.escapeHtml(siteName)}. All rights reserved.</p>
                <div class="flex gap-6">
                    <a href="#" class="hover:text-primary">Privacy Policy</a>
                    <a href="#" class="hover:text-primary">Terms of Service</a>
                </div>
            </div>
        </div>
    </footer>
    <script>
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    </script>
</body>
</html>`;

      files.push({ path: page.path === "/" ? "/index.html" : `${page.path}/index.html`, content: fullHtml, type: "text/html" });
    }

    const manifest: Record<string, string> = {};
    const fileEntries: BundleResult["fileEntries"] = [];

    for (const file of files) {
        const crypto = await import("node:crypto");
        const buffer = Buffer.from(file.content);
        const base64Content = buffer.toString("base64");
        
        const hashInput = base64Content + file.path;
        const hash = crypto.createHash("md5").update(hashInput).digest("hex");
        
        manifest[file.path] = hash;
        fileEntries.push({ 
            path: file.path, 
            hash, 
            content: file.content,
            base64Content,
            type: file.type,
            size: buffer.length
        });
    }

    return { manifest, fileEntries };
  }

  private static renderComponent(component: any, branding: any, stylePreset: any): string {
    const { type, props } = component;
    const normalizedType = normalizeComponentType(String(type || ""));

    switch (normalizedType) {
      case "Hero":
        const alignClass = props.align === "text-center" ? "text-center justify-center" : "text-left";
        const heroTheme = props.theme || stylePreset?.heroTheme || "dark";
        const heroEffect = props.effect || stylePreset?.heroEffect || "none";
        const heroImage = props.backgroundImage || props.image || "";
        const ctaButtons = Array.isArray(props.ctaButtons)
          ? props.ctaButtons.filter((btn: any) => btn && (btn.text || btn.label))
          : [];
        const themeClass =
          heroTheme === "dark"
            ? "bg-slate-950 text-white"
            : heroTheme === "glass"
              ? "bg-white/85 backdrop-blur text-slate-900"
              : "bg-white text-slate-900";
        const heroDescClass = heroTheme === "dark" ? "text-slate-300" : "text-slate-600";
        return `
        <section class="relative py-24 px-4 overflow-hidden ${themeClass} flex items-center min-h-[70vh]">
            ${heroImage ? `<img src="${heroImage}" alt="${props.title || "Hero"}" class="absolute inset-0 w-full h-full object-cover opacity-25" />` : ""}
            ${heroImage ? `<div class="absolute inset-0 bg-black/30"></div>` : ""}
            <div class="container mx-auto relative z-10">
                <div class="max-w-3xl ${props.align === "text-center" ? "mx-auto" : ""} ${alignClass}">
                    <h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-6">${props.title}</h1>
                    ${props.description || props.subtitle ? `<p class="text-xl md:text-2xl mb-10 leading-relaxed ${heroDescClass}">${props.description || props.subtitle}</p>` : ""}
                    ${
                      ctaButtons.length > 0
                        ? `<div class="flex flex-wrap gap-3 ${props.align === "text-center" ? "justify-center" : "justify-start"}">
                            ${ctaButtons
                              .slice(0, 2)
                              .map((btn: any) => {
                                const btnHref = btn.href || btn.link || btn.url || "#";
                                const btnText = btn.text || btn.label || "Learn More";
                                const isSecondary = btn.variant === "secondary" || btn.style === "secondary";
                                return `<a href="${btnHref}" class="${
                                  isSecondary
                                    ? "bg-white/15 border border-white/40 text-white"
                                    : "bg-primary text-white"
                                } px-8 py-4 rounded-full font-bold shadow-lg hover:opacity-90 transition-all">${btnText}</a>`;
                              })
                              .join("")}
                           </div>`
                        : `<button class="bg-primary px-8 py-4 rounded-full font-bold shadow-lg shadow-primary/25 hover:opacity-90 transition-all">${props.ctaText || props.cta_text || "Learn More"}</button>`
                    }
                </div>
            </div>
            ${heroEffect === "retro-grid" ? `<div class="absolute inset-0 opacity-20" style="background-image: linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px); background-size: 40px 40px;"></div>` : ""}
        </section>`;

      case "Stats":
        return `
        <section class="py-20 bg-slate-50">
            <div class="container mx-auto px-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
                    ${(props.items || []).map((item: any) => `
                        <div class="text-center">
                            <div class="text-4xl font-bold text-primary mb-2">${item.value}</div>
                            <div class="text-slate-600 font-medium">${item.label}</div>
                        </div>
                    `).join("")}
                </div>
            </div>
        </section>`;

      case "ProductPreview":
      case "Product_Preview":
        const previewItems = this.normalizePreviewItems(
          Array.isArray(props.items)
            ? props.items
            : Array.isArray(props.articles)
              ? props.articles
              : Array.isArray(props.posts)
                ? props.posts
                : [],
        );
        return `
        <section class="py-24 bg-slate-50">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-3xl md:text-5xl font-bold mb-6">${props.title || props.sectionTitle || "Our Products"}</h2>
                    ${props.subtitle || props.sectionSubtitle || props.description ? `<p class="text-slate-600 max-w-3xl mx-auto">${props.subtitle || props.sectionSubtitle || props.description || ""}</p>` : ""}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    ${previewItems.map((item: any) => `
                        <div class="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all group border border-slate-100">
                            <div class="aspect-video relative overflow-hidden bg-slate-100">
                                ${item.image ? `<img src="${item.image}" class="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" alt="${item.title}">` : ""}
                            </div>
                            <div class="p-8">
                                <div class="flex items-center justify-between gap-3 mb-3">
                                    <h3 class="text-xl font-bold">${item.title}</h3>
                                    ${item.tag ? `<span class="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold">${item.tag}</span>` : ""}
                                </div>
                                <p class="text-slate-600 mb-6">${item.description}</p>
                                ${item.href || item.ctaText ? `<a href="${item.href || "#"}" class="inline-flex items-center gap-2 text-primary font-semibold">${item.ctaText || "Learn More"}<span>→</span></a>` : ""}
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        </section>`;

      case "FeatureHighlight":
      case "Feature_Highlight":
        const isRight = props.align === "right";
        const featureItems = Array.isArray(props.features)
          ? props.features
          : Array.isArray(props.highlights)
            ? props.highlights
            : Array.isArray(props.points)
              ? props.points
              : [];
        return `
        <section class="py-24 bg-white overflow-hidden">
            <div class="container mx-auto px-4">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div class="${isRight ? 'lg:order-1' : ''}">
                        <h2 class="text-3xl md:text-5xl font-bold mb-6">${props.title || props.headline || "Core Highlights"}</h2>
                        <p class="text-lg text-slate-600 mb-8 leading-relaxed">${props.description || props.summary || props.content || ""}</p>
                        ${featureItems.length ? `
                        <div class="space-y-3 mb-10">
                          ${featureItems
                            .map((feature: any) => {
                              const title =
                                typeof feature === "string"
                                  ? feature
                                  : feature?.title || feature?.label || feature?.name || "";
                              const description =
                                typeof feature === "string" ? "" : feature?.description || feature?.desc || "";
                              if (!title && !description) return "";
                              return `
                            <div class="flex items-center gap-3">
                              <div class="w-5 h-5 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                                <i data-lucide="${this.normalizeLucideIconName(
                                  typeof feature === "object" ? feature?.icon : "",
                                  "check",
                                )}" class="w-3 h-3"></i>
                              </div>
                              <div class="text-slate-700">
                                ${title ? `<div class="font-medium">${title}</div>` : ""}
                                ${description ? `<div class="text-sm text-slate-600 mt-1">${description}</div>` : ""}
                              </div>
                            </div>
                          `;
                            })
                            .join("")}
                        </div>
                        ` : ""}
                        ${(props.ctaText || props.cta_text) ? `
                        <a href="${props.ctaLink || props.cta_link || '#'}" class="inline-flex items-center justify-center px-8 py-4 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/25 hover:opacity-90 transition-all">
                            ${props.ctaText || props.cta_text}
                        </a>
                        ` : ""}
                    </div>
                    <div class="${isRight ? 'lg:order-2' : ''} relative">
                         ${props.image || props.cover || props.imageUrl ? `<img src="${props.image || props.cover || props.imageUrl}" class="rounded-3xl shadow-2xl relative z-10 w-full" alt="${props.title || props.headline || "feature"}">` : `<div class="aspect-square bg-slate-200 rounded-3xl animate-pulse"></div>`}
                    </div>
                </div>
            </div>
        </section>`;

      case "Content_Block":
        const alignContent = props.align === "center" ? "text-center mx-auto" : "text-left";
        return `
        <section class="py-24 bg-white">
            <div class="container mx-auto px-4">
                <div class="max-w-4xl ${alignContent}">
                    ${props.title ? `<h2 class="text-3xl md:text-4xl font-bold mb-8">${props.title}</h2>` : ""}
                    <div class="prose prose-lg prose-slate ${props.align === "center" ? "mx-auto" : ""} max-w-none">
                        ${this.renderStructuredContentBlock(props.content || "")}
                    </div>
                </div>
            </div>
        </section>`;

      case "ContactForm":
      case "Contact_Form":
        const formFields = this.normalizeContactFields(props.fields);
        const formActionUrl = props.actionUrl || props.action_url || "#";
        const formSiteKey = props.siteKey || props.site_key || "";
        return `
        <section class="py-24 bg-slate-50">
            <div class="container mx-auto px-4 max-w-4xl">
                <div class="bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-sm">
                    <h2 class="text-3xl md:text-4xl font-bold text-slate-900 mb-4">${props.title || "Contact Us"}</h2>
                    ${props.description ? `<p class="text-slate-600 mb-10">${props.description}</p>` : ""}
                    <form method="post" action="${formActionUrl}" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${formSiteKey ? `<input type="hidden" name="_site_key" value="${formSiteKey}">` : ""}
                        ${formFields
                          .map((field: any) => {
                            const requiredAttr = field.required ? "required" : "";
                            const requiredMark = field.required ? `<span class="text-red-500 ml-1">*</span>` : "";
                            const baseLabel = `
                                <label for="${field.name}" class="block text-sm font-semibold text-slate-700 mb-2">
                                    ${field.label}${requiredMark}
                                </label>
                            `;

                            if (field.type === "textarea") {
                              return `
                                <div class="md:col-span-2">
                                    ${baseLabel}
                                    <textarea id="${field.name}" name="${field.name}" ${requiredAttr} placeholder="${field.placeholder}" rows="5" class="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                                </div>
                              `;
                            }

                            if (field.type === "select") {
                              return `
                                <div class="md:col-span-1">
                                    ${baseLabel}
                                    <select id="${field.name}" name="${field.name}" ${requiredAttr} class="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                        <option value="" disabled selected>${field.placeholder || `Select ${field.label}`}</option>
                                        ${(field.options || []).map((option: string) => `<option value="${option}">${option}</option>`).join("")}
                                    </select>
                                </div>
                              `;
                            }

                            return `
                                <div class="md:col-span-1">
                                    ${baseLabel}
                                    <input id="${field.name}" name="${field.name}" type="${field.type}" ${requiredAttr} placeholder="${field.placeholder}" class="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
                                </div>
                            `;
                          })
                          .join("")}
                        <div class="md:col-span-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-2">
                            <p class="text-xs text-slate-500">${props.privacyNote || "By submitting, you agree that we can contact you regarding your inquiry."}</p>
                            <button type="submit" class="inline-flex justify-center items-center rounded-xl bg-primary text-white font-semibold px-8 py-3 hover:opacity-90 transition-colors">
                                ${props.submitText || "Submit"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>`;

      case "CTASection":
      case "CTA_Section":
        const ctaTheme = props.theme === "light" ? "bg-slate-50 text-slate-900" : props.theme === "dark" ? "bg-slate-950 text-white" : "bg-primary text-white";
        const btnTheme = props.theme === "light" ? "bg-primary text-white" : "bg-white text-slate-900";
        return `
        <section class="py-24 px-4 ${ctaTheme}">
            <div class="container mx-auto max-w-5xl text-center">
                <h2 class="text-4xl md:text-5xl font-bold mb-6">${props.title}</h2>
                ${props.description ? `<p class="text-xl md:text-2xl opacity-90 mb-10 max-w-2xl mx-auto">${props.description}</p>` : ""}
                <a href="${props.ctaLink || props.cta_link || '#'}" class="inline-block px-10 py-5 ${btnTheme} rounded-full font-bold text-lg shadow-xl hover:scale-105 transition-transform">
                    ${props.ctaText || props.cta_text || "Get Started"}
                </a>
            </div>
        </section>`;

      case "FAQ":
        return `
        <section class="py-24 bg-slate-50">
            <div class="container mx-auto px-4 max-w-3xl">
                ${props.title ? `<div class="text-center mb-16"><h2 class="text-3xl md:text-4xl font-bold">${props.title}</h2></div>` : ""}
                <div class="space-y-4">
                    ${(props.items || []).map((item: any, idx: number) => `
                        <div class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
                            <h3 class="text-xl font-bold mb-3 text-slate-900">${item.question}</h3>
                            <p class="text-slate-600 leading-relaxed">${item.answer}</p>
                        </div>
                    `).join("")}
                </div>
            </div>
        </section>`;

      case "Logos":
        return `
        <section class="py-16 bg-white border-y border-slate-100">
            <div class="container mx-auto px-4">
                ${props.title ? `<p class="text-center text-sm font-semibold text-slate-500 uppercase tracking-wider mb-8">${props.title}</p>` : ""}
                <div class="flex flex-wrap justify-center items-center gap-12 md:gap-16 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                    ${(props.items || []).map((item: any) => `
                        ${item.logo ? `<img src="${item.logo}" alt="${item.name}" class="h-8 md:h-10 w-auto object-contain">` : `<span class="font-bold text-xl text-slate-400">${item.name}</span>`}
                    `).join("")}
                </div>
            </div>
        </section>`;

      case "Timeline":
      case "TimelineSection":
      case "Timeline_Section":
        const timelineItems = Array.isArray(props.items)
          ? props.items
          : Array.isArray(props.events)
            ? props.events
            : Array.isArray(props.milestones)
              ? props.milestones
              : [];
        return `
        <section class="py-24 bg-white">
            <div class="container mx-auto px-4 max-w-5xl">
                <div class="text-center mb-16">
                    <h2 class="text-3xl md:text-4xl font-bold mb-4">${props.title || "Development Timeline"}</h2>
                    ${props.subtitle ? `<p class="text-slate-600 max-w-3xl mx-auto">${props.subtitle}</p>` : ""}
                </div>
                <div class="space-y-8">
                    ${timelineItems
                      .map((item: any, index: number) => {
                        const stamp = item?.year || item?.date || item?.time || `Step ${index + 1}`;
                        const title = item?.title || item?.name || item?.label || `Milestone ${index + 1}`;
                        const description = item?.description || item?.content || item?.summary || "";
                        return `
                        <article class="relative pl-12">
                            <span class="absolute left-0 top-1 w-7 h-7 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center">${index + 1}</span>
                            <div class="absolute left-3.5 top-8 bottom-[-2rem] w-px bg-slate-200"></div>
                            <p class="text-xs uppercase tracking-wider text-primary font-semibold mb-2">${stamp}</p>
                            <h3 class="text-xl font-bold mb-2">${title}</h3>
                            ${description ? `<p class="text-slate-600 leading-relaxed">${description}</p>` : ""}
                        </article>
                      `;
                      })
                      .join("")}
                </div>
            </div>
        </section>`;

      case "Team":
      case "TeamGrid":
      case "Team_Grid":
        const teamItems = Array.isArray(props.items)
          ? props.items
          : Array.isArray(props.members)
            ? props.members
            : [];
        return `
        <section class="py-24 bg-slate-50">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-3xl md:text-4xl font-bold mb-4">${props.title || "Our Team"}</h2>
                    ${props.subtitle ? `<p class="text-slate-600 max-w-3xl mx-auto">${props.subtitle}</p>` : ""}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    ${teamItems
                      .map((member: any) => {
                        const name = member?.name || member?.title || member?.label || "Team Member";
                        const role = member?.role || member?.position || member?.subtitle || "";
                        const bio = member?.description || member?.bio || member?.content || "";
                        const avatar = member?.image || member?.avatar || member?.photo || "";
                        return `
                        <article class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-xl transition-all">
                            ${avatar ? `<img src="${avatar}" alt="${name}" class="w-16 h-16 rounded-full object-cover mb-4">` : `<div class="w-16 h-16 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center mb-4">${this.toSafeText(name).slice(0, 1)}</div>`}
                            <h3 class="text-lg font-bold">${name}</h3>
                            ${role ? `<p class="text-sm text-primary font-semibold mt-1">${role}</p>` : ""}
                            ${bio ? `<p class="text-slate-600 mt-3 leading-relaxed">${bio}</p>` : ""}
                        </article>
                      `;
                      })
                      .join("")}
                </div>
            </div>
        </section>`;

      case "ComparisonTable":
      case "Comparison_Table":
        const sourceRows = Array.isArray(props.rows)
          ? props.rows
          : Array.isArray(props.items)
            ? props.items
            : [];
        const configuredColumns = Array.isArray(props.columns)
          ? props.columns.map((col: any) => (typeof col === "string" ? col : col?.title || col?.label || col?.name || "")).filter(Boolean)
          : [];
        const inferredColumns =
          configuredColumns.length > 0
            ? configuredColumns
            : sourceRows.length > 0 && typeof sourceRows[0] === "object" && sourceRows[0] !== null
              ? Object.keys(sourceRows[0]).filter((key) => key !== "id")
              : [];
        return `
        <section class="py-24 bg-white">
            <div class="container mx-auto px-4">
                <div class="text-center mb-12">
                    <h2 class="text-3xl md:text-4xl font-bold mb-4">${props.title || "Comparison"}</h2>
                    ${props.subtitle ? `<p class="text-slate-600 max-w-3xl mx-auto">${props.subtitle}</p>` : ""}
                </div>
                <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table class="min-w-full text-sm">
                        <thead class="bg-slate-50">
                            <tr>
                                ${inferredColumns.map((col: string) => `<th class="px-4 py-3 text-left font-bold text-slate-700">${col}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${sourceRows
                              .map((row: any) => {
                                const cells = inferredColumns.map((col: string) => {
                                  const value =
                                    row && typeof row === "object"
                                      ? row[col]
                                      : "";
                                  return `<td class="px-4 py-3 border-t border-slate-100 text-slate-700">${this.toSafeText(value)}</td>`;
                                });
                                return `<tr>${cells.join("")}</tr>`;
                              })
                              .join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>`;

      case "ValuePropositions":
      case "Value_Propositions":
        const propositionItems = Array.isArray(props.items)
          ? props.items
          : Array.isArray(props.columns)
            ? props.columns.map((column: any) => ({
                title: column?.title || column?.name || "",
                description: Array.isArray(column?.lines)
                  ? column.lines.map((line: any) => this.toSafeText(line)).filter(Boolean).join(" | ")
                  : column?.description || column?.content || "",
              }))
            : [];
        return `
        <section class="py-24 bg-white">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-3xl md:text-4xl font-bold mb-4">${props.title || "Why Choose Us"}</h2>
                    <p class="text-slate-600 max-w-2xl mx-auto">${props.subtitle || ""}</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    ${propositionItems.map((item: any) => `
                        <div class="p-8 rounded-2xl border border-slate-100 hover:shadow-xl transition-all group">
                            <div class="w-12 h-12 bg-blue-50 text-primary rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors">
                                <i data-lucide="${this.normalizeLucideIconName(item?.icon, "check")}" class="w-6 h-6"></i>
                            </div>
                            <h3 class="text-xl font-bold mb-4">${item.title}</h3>
                            <p class="text-slate-600">${item.description}</p>
                        </div>
                    `).join("")}
                </div>
            </div>
        </section>`;

      case "Testimonials":
        return `
        <section class="py-24 bg-white overflow-hidden">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-3xl md:text-4xl font-bold mb-4">${props.title || "Client Stories"}</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    ${(props.items || []).map((item: any) => `
                        <div class="p-8 rounded-2xl bg-slate-50 border border-slate-100">
                            <p class="text-lg text-slate-700 italic mb-8">"${item.content}"</p>
                            <div class="flex items-center gap-4">
                                <div>
                                    <div class="font-bold">${item.author}</div>
                                    <div class="text-sm text-slate-500">${item.role || ""}</div>
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        </section>`;

      default:
        return this.renderUnknownComponent(normalizedType || String(type || "Component"), props || {});
    }
  }
}


