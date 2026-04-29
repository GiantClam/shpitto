"use client";

import { FormEvent, type ChangeEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, MessageCircle, Paperclip, Upload, X } from "lucide-react";
import { getLandingCopy, type Locale } from "@/lib/i18n";
import { storeLaunchCenterChatHandoff } from "@/lib/launch-center/chat-handoff";

type SessionPayload = {
  id: string;
  title: string;
};

type SessionsResponse = {
  ok: boolean;
  session?: SessionPayload;
  error?: string;
};

type LaunchCenterComposerProps = {
  isAuthenticated: boolean;
  locale?: Locale;
};

const COMPOSER_FILE_COPY: Record<
  Locale,
  {
    attach: string;
    uploadLocal: string;
    selectedFiles: string;
    removeFile: string;
  }
> = {
  en: {
    attach: "Attach files",
    uploadLocal: "Upload local files",
    selectedFiles: "Selected files",
    removeFile: "Remove file",
  },
  zh: {
    attach: "\u6dfb\u52a0\u6587\u4ef6",
    uploadLocal: "\u4e0a\u4f20\u672c\u5730\u6587\u4ef6",
    selectedFiles: "\u5df2\u9009\u6587\u4ef6",
    removeFile: "\u79fb\u9664\u6587\u4ef6",
  },
};

function normalizeProjectTitle(input: string, fallback: string): string {
  const compact = String(input || "").trim().replace(/\s+/g, " ");
  if (!compact) return fallback;
  const plain = compact
    .replace(/[^\p{L}\p{N}\s\-_,.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return fallback;
  const words = plain.split(" ").slice(0, 8).join(" ");
  return words.length > 64 ? `${words.slice(0, 64).trim()}...` : words;
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function LaunchCenterComposer({ isAuthenticated, locale = "en" }: LaunchCenterComposerProps) {
  const copy = getLandingCopy(locale).launch.composer;
  const fileCopy = COMPOSER_FILE_COPY[locale] || COMPOSER_FILE_COPY.en;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState(copy.defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const disabled = useMemo(() => loading || !String(prompt || "").trim(), [loading, prompt]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []).filter(Boolean);
    if (selected.length > 0) {
      setPendingFiles((prev) => {
        const seen = new Set(prev.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
        const next = [...prev];
        for (const file of selected) {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(file);
        }
        return next;
      });
    }
    event.target.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const finalPrompt = String(prompt || "").trim();
    if (!finalPrompt || loading) return;

    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent("/launch-center")}`);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: normalizeProjectTitle(finalPrompt, copy.newProject) }),
      });
      const data = (await res.json()) as SessionsResponse;
      if (!res.ok || !data.ok || !data.session?.id) {
        throw new Error(data.error || copy.createFailed);
      }
      storeLaunchCenterChatHandoff(data.session.id, {
        prompt: finalPrompt,
        files: pendingFiles,
      });
      setPendingFiles([]);
      router.push(`/projects/${encodeURIComponent(data.session.id)}/chat?launch=1`);
    } catch (err: any) {
      setLoading(false);
      setError(String(err?.message || err || copy.createFailed));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_82%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,var(--shp-bg)_12%)] p-4 md:p-6 shadow-[0_18px_50px_color-mix(in_oklab,var(--shp-hot)_8%,transparent)]"
    >
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
      <label htmlFor="launch-prompt" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--shp-text)]">
        <MessageCircle className="h-4 w-4 text-[var(--shp-primary)]" />
        {copy.label}
      </label>
      <textarea
        id="launch-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        className="w-full resize-none rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_98%,var(--shp-bg-soft)_2%)] px-4 py-3 text-sm leading-relaxed text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_50%,transparent)]"
        placeholder={copy.placeholder}
      />
      {pendingFiles.length > 0 ? (
        <div className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_62%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--shp-text)]">
            <Paperclip className="h-3.5 w-3.5 text-[var(--shp-primary)]" />
            {fileCopy.selectedFiles}
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((file) => {
              const key = `${file.name}:${file.size}:${file.lastModified}`;
              return (
                <span
                  key={key}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--shp-primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_8%,var(--shp-surface)_92%)] px-2 py-1 text-[11px] text-[var(--shp-text)]"
                  title={`${file.name} · ${formatFileSize(file.size)}`}
                >
                  <span className="max-w-[190px] truncate">{file.name}</span>
                  <span className="shrink-0 text-[color-mix(in_oklab,var(--shp-muted)_86%,transparent)]">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((item) => item !== file))}
                    className="shrink-0 rounded-sm p-0.5 text-[var(--shp-muted)] hover:text-[var(--shp-text)]"
                    aria-label={`${fileCopy.removeFile}: ${file.name}`}
                    disabled={loading}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--shp-muted)]">
          {copy.chips.map((chip) => (
            <span key={chip} className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 py-1">
              {chip}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_96%,var(--shp-bg)_4%)] px-4 py-2.5 text-xs font-semibold text-[var(--shp-text)] hover:bg-[color-mix(in_oklab,var(--shp-surface)_100%,var(--shp-bg)_0%)] disabled:cursor-not-allowed disabled:opacity-60"
            title={fileCopy.attach}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{fileCopy.uploadLocal}</span>
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="shp-btn-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-xs font-black sm:text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
            {copy.send}
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
    </form>
  );
}
