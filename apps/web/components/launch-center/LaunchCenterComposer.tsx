"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, MessageCircle } from "lucide-react";

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
};

function normalizeProjectTitle(input: string): string {
  const compact = String(input || "").trim().replace(/\s+/g, " ");
  if (!compact) return "New Project";
  const plain = compact
    .replace(/[^\p{L}\p{N}\s\-_,.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "New Project";
  const words = plain.split(" ").slice(0, 8).join(" ");
  return words.length > 64 ? `${words.slice(0, 64).trim()}...` : words;
}

export function LaunchCenterComposer({ isAuthenticated }: LaunchCenterComposerProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(
    "Build a clean, conversion-focused site for our precision components business. Keep technical proof above the fold, then route visitors by industry use case.",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const disabled = useMemo(() => loading || !String(prompt || "").trim(), [loading, prompt]);

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
        body: JSON.stringify({ title: normalizeProjectTitle(finalPrompt) }),
      });
      const data = (await res.json()) as SessionsResponse;
      if (!res.ok || !data.ok || !data.session?.id) {
        throw new Error(data.error || "Failed to create project.");
      }
      router.push(`/projects/${encodeURIComponent(data.session.id)}/chat?prompt=${encodeURIComponent(finalPrompt)}`);
    } catch (err: any) {
      setLoading(false);
      setError(String(err?.message || err || "Failed to create project."));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_80%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_52%,black_48%)] p-4 md:p-6"
    >
      <label htmlFor="launch-prompt" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--shp-text)]">
        <MessageCircle className="h-4 w-4 text-[var(--shp-primary)]" />
        Conversation
      </label>
      <textarea
        id="launch-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        className="w-full resize-none rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_36%,black_64%)] px-4 py-3 text-sm leading-relaxed text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_50%,transparent)]"
        placeholder="Describe the project you want to build..."
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--shp-muted)]">
          <span className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 py-1">Reference</span>
          <span className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 py-1">Project</span>
          <span className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] px-2 py-1">Template</span>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="shp-btn-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-xs font-black sm:text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
          Send
        </button>
      </div>
      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </form>
  );
}
