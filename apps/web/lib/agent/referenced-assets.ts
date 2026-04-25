const REFERENCED_ASSETS_HEADER = "[Referenced Assets]";

function normalizeLine(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupeAssetLines(lines: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

export function formatReferencedAssetsBlock(assetLines: string[]): string {
  const deduped = dedupeAssetLines(assetLines);
  if (deduped.length === 0) return "";
  return [REFERENCED_ASSETS_HEADER, ...deduped.map((line) => `- ${line}`)].join("\n");
}

export function appendReferencedAssetsBlock(baseText: string, assetLines: string[]): string {
  const normalizedBase = String(baseText || "").trim();
  const block = formatReferencedAssetsBlock(assetLines);
  if (!block) return normalizedBase;
  if (!normalizedBase) return block;
  return `${normalizedBase}\n\n${block}`.trim();
}

export function parseReferencedAssetsFromText(input: string): {
  cleanText: string;
  referencedAssets: string[];
  hasBlock: boolean;
} {
  const lines = String(input || "").split(/\r?\n/);
  if (lines.length === 0) {
    return { cleanText: "", referencedAssets: [], hasBlock: false };
  }

  const outputLines: string[] = [];
  const extracted: string[] = [];
  let inAssetBlock = false;
  let sawHeader = false;

  for (const line of lines) {
    const trimmed = String(line || "").trim();

    if (!inAssetBlock && trimmed.toLowerCase() === REFERENCED_ASSETS_HEADER.toLowerCase()) {
      inAssetBlock = true;
      sawHeader = true;
      continue;
    }

    if (inAssetBlock) {
      if (!trimmed) continue;
      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet?.[1]) {
        extracted.push(bullet[1]);
        continue;
      }
      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ordered?.[1]) {
        extracted.push(ordered[1]);
        continue;
      }
      inAssetBlock = false;
    }

    outputLines.push(line);
  }

  const cleanText = outputLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    cleanText,
    referencedAssets: dedupeAssetLines(extracted),
    hasBlock: sawHeader,
  };
}

export function collectReferencedAssetsFromTexts(texts: string[]): string[] {
  const combined: string[] = [];
  for (const text of texts || []) {
    const parsed = parseReferencedAssetsFromText(String(text || ""));
    combined.push(...parsed.referencedAssets);
  }
  return dedupeAssetLines(combined);
}
