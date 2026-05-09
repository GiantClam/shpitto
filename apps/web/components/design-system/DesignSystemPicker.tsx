"use client";

import { useEffect, useState, useTransition } from "react";

import type { DesignSystemSummary } from "@/lib/design-system-registry";

type DesignSystemPickerProps = {
  selectedId?: string;
  onSelect?: (designSystem: DesignSystemSummary) => void;
  compact?: boolean;
};

type DesignSystemsResponse = {
  ok?: boolean;
  designSystems?: DesignSystemSummary[];
  error?: string;
};

function swatchesFor(system: DesignSystemSummary): string[] {
  return system.swatches.length > 0 ? system.swatches.slice(0, 5) : ["#0f172a", "#f8fafc", "#2563eb"];
}

export function DesignSystemPicker({ selectedId, onSelect, compact = false }: DesignSystemPickerProps) {
  const [systems, setSystems] = useState<DesignSystemSummary[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      fetch("/api/design-systems", { cache: "force-cache" })
        .then((response) => response.json() as Promise<DesignSystemsResponse>)
        .then((payload) => {
          if (cancelled) return;
          if (!payload.ok) {
            setError(payload.error || "Failed to load design systems.");
            return;
          }
          setSystems(payload.designSystems || []);
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to load design systems.");
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-950">Design system inspiration</div>
            <div className="text-xs text-slate-500">
              Local awesome-design-md references for stronger website visual direction.
            </div>
          </div>
          <div className="text-xs text-slate-400">{isPending ? "Loading..." : `${systems.length} styles`}</div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {systems.map((system) => {
          const active = selectedId === system.id;
          return (
            <button
              key={system.id}
              type="button"
              onClick={() => onSelect?.(system)}
              className={[
                "group rounded-3xl border bg-white p-4 text-left shadow-sm transition",
                active
                  ? "border-slate-950 ring-2 ring-slate-950/10"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
              ].join(" ")}
            >
              <div className="mb-4 flex gap-1.5">
                {swatchesFor(system).map((color) => (
                  <span
                    key={`${system.id}-${color}`}
                    className="h-7 w-7 rounded-full border border-black/10"
                    style={{ background: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="text-sm font-semibold text-slate-950">{system.title}</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                {system.category}
              </div>
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">{system.summary}</p>
              <a
                href={`/api/design-systems/${encodeURIComponent(system.id)}/preview`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-xs font-semibold text-slate-900 underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                Preview reference
              </a>
            </button>
          );
        })}
      </div>
    </div>
  );
}
