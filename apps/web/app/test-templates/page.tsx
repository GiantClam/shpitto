"use client";

import { useState, useEffect } from "react";
import { WebsitePreview } from "@/components/website-preview";
import { RefreshCw, ExternalLink, CheckCircle, XCircle } from "lucide-react";

interface Template {
  id: string;
  name: string;
  slug: string;
  source_url: string;
  description: string;
  verification_status: string;
}

export default function TestTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puckData, setPuckData] = useState<any>(null);
  const [visualSpec, setVisualSpec] = useState<any>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/templates");
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = async (template: Template) => {
    setSelectedTemplate(template);
    setLoading(true);
    
    try {
      const res = await fetch(`/api/templates/${template.id}`);
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setPuckData(data.puck_data || { content: [] });
      setVisualSpec(data.visual_spec);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const projectJson = {
    branding: {
      name: selectedTemplate?.name || "Template Preview",
      colors: {
        primary: "#0f172a",
        accent: "#2563eb",
      },
    },
    pages: [
      {
        path: "/",
        seo: { title: selectedTemplate?.name || "Template", description: selectedTemplate?.description || "" },
        puckData: puckData || { content: [] },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Template Verification</h1>
            <p className="text-sm text-slate-500">Select a template to preview rendering</p>
          </div>
          <button
            onClick={loadTemplates}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            Error: {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-900 mb-3">
                Templates ({loading ? "..." : templates.length})
              </h2>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-10 h-10 bg-slate-200 rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-slate-200 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <div className="text-red-600 mb-2">Error loading templates</div>
                  <div className="text-sm text-slate-500 mb-4">{error}</div>
                  <button
                    onClick={loadTemplates}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No templates found. Load some templates first.
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-auto">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => selectTemplate(template)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedTemplate?.id === template.id
                          ? "bg-blue-50 border-blue-200 border-2"
                          : "bg-slate-50 hover:bg-slate-100 border border-transparent"
                      }`}
                    >
                      <div className="font-medium text-slate-900 truncate">{template.name}</div>
                      <div className="text-xs text-slate-500 truncate">{template.slug}</div>
                      <div className="flex items-center gap-2 mt-2">
                        {template.verification_status === "verified" ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3 h-3" /> Verified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-yellow-600">
                            <XCircle className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            {selectedTemplate ? (
              <div className="bg-white rounded-xl border overflow-hidden">
                {/* Template Info */}
                <div className="p-4 border-b bg-slate-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">{selectedTemplate.name}</h2>
                      <p className="text-sm text-slate-500 mt-1">{selectedTemplate.description?.substring(0, 150)}...</p>
                      <a
                        href={selectedTemplate.source_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Original: {selectedTemplate.source_url}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Visual Spec */}
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

                {/* Puck Preview */}
                <div className="h-[600px] overflow-auto bg-slate-100">
                  <WebsitePreview data={puckData} project_json={projectJson} />
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
                <p className="text-slate-500">Choose a template from the list to preview its rendering</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
