"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeBlogMarkdown } from "@/lib/blog-markdown";

type ListenerApi = {
  markdownUpdated: (fn: (_ctx: unknown, markdown: string, prevMarkdown: string) => void) => unknown;
};

type CrepeInstance = {
  create: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
  getMarkdown: () => string;
  on: (fn: (api: ListenerApi) => void) => unknown;
  setReadonly: (value: boolean) => unknown;
};

type CrepeConstructor = {
  new (options: { root?: Node | string | null; defaultValue?: string; featureConfigs?: Record<string, unknown> }): CrepeInstance;
  Feature: {
    ImageBlock: string;
  };
};

type BlogAssetUploadResponse = {
  ok: boolean;
  asset?: {
    url?: string;
  };
  error?: string;
};

export function BlogMilkdownEditor({
  value,
  onChange,
  disabled = false,
  imageUploadUrl,
  imageAltText,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  imageUploadUrl?: string;
  imageAltText?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CrepeInstance | null>(null);
  const initialValueRef = useRef(value || "");
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const imageUploadUrlRef = useRef(imageUploadUrl);
  const imageAltTextRef = useRef(imageAltText);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    imageUploadUrlRef.current = imageUploadUrl;
    imageAltTextRef.current = imageAltText;
  }, [imageAltText, imageUploadUrl]);

  useEffect(() => {
    let cancelled = false;
    let activeEditor: CrepeInstance | null = null;

    async function mountEditor() {
      if (!rootRef.current) return;

      try {
        const { Crepe } = (await import("@milkdown/crepe")) as { Crepe: CrepeConstructor };
        if (cancelled || !rootRef.current) return;

        const uploadEditorImage = async (file: File) => {
          const uploadUrl = imageUploadUrlRef.current;
          if (!uploadUrl) {
            throw new Error("Create or select a post before uploading images.");
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("alt", imageAltTextRef.current || file.name);
          formData.append("setAsCover", "0");

          const res = await fetch(uploadUrl, {
            method: "POST",
            body: formData,
          });
          const data = (await res.json()) as BlogAssetUploadResponse;
          if (!res.ok || !data.ok || !data.asset?.url) {
            throw new Error(data.error || "Failed to upload image.");
          }
          return data.asset.url;
        };

        const editor = new Crepe({
          root: rootRef.current,
          defaultValue: initialValueRef.current,
          featureConfigs: {
            [Crepe.Feature.ImageBlock]: {
              onUpload: uploadEditorImage,
              blockOnUpload: uploadEditorImage,
              inlineOnUpload: uploadEditorImage,
              proxyDomURL: (url: string) => url,
            },
          },
        });

        editor.on((api) => {
          api.markdownUpdated((_ctx, markdown) => {
            onChangeRef.current(normalizeBlogMarkdown(markdown));
          });
        });

        activeEditor = editor;
        await editor.create();
        if (cancelled) {
          await editor.destroy();
          return;
        }

        editor.setReadonly(disabledRef.current);
        editorRef.current = editor;
        setLoading(false);
      } catch (err) {
        console.error("Failed to initialize Milkdown editor", err);
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    }

    void mountEditor();

    return () => {
      cancelled = true;
      editorRef.current = null;
      if (activeEditor) {
        void activeEditor.destroy().catch((err) => {
          console.error("Failed to destroy Milkdown editor", err);
        });
      }
    };
  }, []);

  useEffect(() => {
    editorRef.current?.setReadonly(disabled);
  }, [disabled]);

  if (failed) {
    return (
      <textarea
        value={value || ""}
        onChange={(event) => onChange(normalizeBlogMarkdown(event.target.value))}
        rows={18}
        disabled={disabled}
        className="w-full rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_40%,transparent)] px-3 py-3 font-mono text-sm leading-6 text-[var(--shp-text)] outline-none focus:border-[color-mix(in_oklab,var(--shp-primary)_46%,transparent)] disabled:cursor-not-allowed disabled:opacity-70"
        placeholder="# Write your post in Markdown"
      />
    );
  }

  return (
    <div className="blog-milkdown-editor relative overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_66%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_54%,transparent)]">
      {loading ? (
        <div className="absolute inset-x-0 top-0 z-10 border-b border-[color-mix(in_oklab,var(--shp-border)_58%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_86%,transparent)] px-4 py-2 text-xs text-[var(--shp-muted)]">
          Loading Milkdown editor...
        </div>
      ) : null}
      <div ref={rootRef} aria-label="Blog Markdown editor" />
    </div>
  );
}
