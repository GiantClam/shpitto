"use client";

import { useState } from "react";
import { WebsitePreview } from "@/components/website-preview";
import { RefreshCw, ExternalLink, XCircle } from "lucide-react";

const TEMPLATES = [
  { id: "uuid-placeholder", name: "加载中...", slug: "loading", source_url: "", description: "", verification_status: "pending" }
];

async function loadInitialTemplates() {
  const res = await fetch("/api/templates");
  const data = await res.json();
  return data.templates || [];
}

export default function TestTemplatesStaticPage() {
  const [templates, setTemplates] = useState<any[]>(TEMPLATES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [puckData, setPuckData] = useState<any>(null);
  const [visualSpec, setVisualSpec] = useState<any>(null);
  const [prompt, setPrompt] = useState("");
  const [pageKind, setPageKind] = useState("");
  const [recommendation, setRecommendation] = useState<any>(null);

  const selectedTemplate = templates.find((t: any) => t.id === selectedId);

  const loadTemplate = async (template: any) => {
    setSelectedId(template.id);
    setLoading(true);
    
    try {
      const res = await fetch(`/api/templates/${template.id}`);
      const data = await res.json();
      setPuckData(data.puck_data || { content: [] });
      setVisualSpec(data.visual_spec);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const palette = visualSpec?.palette || { primary: "#0f172a", accent: "#2563eb" };
  const projectJson = {
    branding: {
      name: selectedTemplate?.name || "Template Preview",
      colors: palette,
      style: {
        typography: visualSpec?.typography?.font,
        borderRadius: visualSpec?.layout?.radius,
      },
    },
    pages: [{
      path: "/",
      seo: { title: selectedTemplate?.name || "Template", description: selectedTemplate?.description || "" },
      puckData: puckData || { content: [] },
    }],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Template Verification (Static)</h1>
            <p className="text-sm text-slate-500">Select a template to preview rendering</p>
          </div>
          <button
            onClick={async () => {
              const data = await loadInitialTemplates();
              setTemplates(data);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Load Templates
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-900 mb-3">LLM Template Picker</h2>
              <div className="space-y-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the site you want (e.g. dark aerospace landing with metrics and testimonials)."
                  className="w-full min-h-[120px] rounded-lg border border-slate-200 p-3 text-sm"
                />
                <select
                  value={pageKind}
                  onChange={(event) => setPageKind(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <option value="">Auto-detect page type</option>
                  <option value="landing">Landing</option>
                  <option value="product">Product</option>
                  <option value="about">About</option>
                  <option value="pricing">Pricing</option>
                  <option value="case-study">Case Study</option>
                  <option value="careers">Careers</option>
                  <option value="docs">Docs</option>
                </select>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/template-recommendation", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ prompt, pageKind: pageKind || undefined }),
                    });
                    const data = await res.json();
                    setRecommendation(data);
                  }}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                >
                  Recommend Bundle
                </button>
              </div>
              {recommendation && (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="font-semibold text-slate-900">Recommended Page</div>
                  <div className="text-slate-600">{recommendation.page?.name || "None"}</div>
                  <div className="font-semibold text-slate-900 mt-3">Sections</div>
                  <ul className="list-disc list-inside text-slate-600">
                    {(recommendation.sections || []).map((section: any) => (
                      <li key={section.id}>{section.name}</li>
                    ))}
                  </ul>
                  <div className="font-semibold text-slate-900 mt-3">Atomic Blocks</div>
                  <ul className="list-disc list-inside text-slate-600">
                    {(recommendation.atomics || []).map((atomic: any) => (
                      <li key={atomic.id}>{atomic.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-900 mb-3">Templates ({templates.length})</h2>
              <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-auto">
                {templates.map((template: any) => (
                  <button
                    key={template.id}
                    onClick={() => loadTemplate(template)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedId === template.id
                        ? "bg-blue-50 border-blue-200 border-2"
                        : "bg-slate-50 hover:bg-slate-100 border border-transparent"
                    }`}
                  >
                    <div className="font-medium text-slate-900 truncate">{template.name}</div>
                    <div className="text-xs text-slate-500 truncate">{template.slug}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-400">
                      {template.template_type} · {template.template_kind}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedTemplate ? (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                  <h2 className="font-semibold text-slate-900">{selectedTemplate.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">{selectedTemplate.description?.substring(0, 150)}...</p>
                  <a href={selectedTemplate.source_url || "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2">
                    <ExternalLink className="w-3 h-3" />
                    Original: {selectedTemplate.source_url}
                  </a>
                </div>

                {visualSpec && (
                  <div className="p-4 border-b">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Visual Spec</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Typography:</span>
                        <span className="ml-2 text-slate-900">
                          {visualSpec.typography?.heading} / {visualSpec.typography?.body}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Layout:</span>
                        <span className="ml-2 text-slate-900">
                          {visualSpec.layout?.aspect_ratio} / {visualSpec.layout?.resolution}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="h-[600px] overflow-auto bg-slate-100">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <WebsitePreview data={puckData || { content: [] }} project_json={projectJson} />
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Select a Template</h3>
                <p className="text-slate-500">Click "Load Templates" to fetch templates from Supabase</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
