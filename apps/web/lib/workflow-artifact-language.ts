const MOJIBAKE_PUNCTUATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/â€™|â€˜|鈥檚|鈥榮|鈥汢|鈥橾/g, "’"],
  [/â€œ|â€�/g, "”"],
  [/â€”|â€“|鈥[?]?/g, " — "],
  [/â€¦/g, "…"],
  [/Â/g, " "],
];

const WORKFLOW_ENCODING_NOISE_RE = /(?:â€|â€™|â€œ|â€�|â€”|â€“|â€¦|Â|鈥|锟|�)/u;
const ALLOWED_UNICODE_PUNCTUATION =
  "\u2018\u2019\u201C\u201D\u2013\u2014\u2015\u2212\u2026\u2022\u2023\u2043\u2219\u25E6\u00A9\u00AE\u2122\u2190\u2192";
const WORKFLOW_ALLOWED_CHARS_RE = new RegExp(
  `^[\\x09\\x0A\\x0D\\x20-\\x7E${ALLOWED_UNICODE_PUNCTUATION}]+$`,
  "u",
);
const WORKFLOW_DISALLOWED_CHARS_RE = new RegExp(
  `[^\\x09\\x0A\\x0D\\x20-\\x7E${ALLOWED_UNICODE_PUNCTUATION}]`,
  "u",
);
const WORKFLOW_DISALLOWED_CHARS_GLOBAL_RE = new RegExp(
  `[^\\x09\\x0A\\x0D\\x20-\\x7E${ALLOWED_UNICODE_PUNCTUATION}]`,
  "gu",
);

function normalizeWorkflowPunctuation(value: string): string {
  let next = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  for (const [pattern, replacement] of MOJIBAKE_PUNCTUATION_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next
    .replace(/[\u201A\u2032]/g, "’")
    .replace(/[\u201E\u2033]/g, "”")
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/\u00A0/g, " ");
}

function squeezeWhitespace(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeWorkflowArtifactText(value: unknown): string {
  return squeezeWhitespace(String(value || ""));
}

export function containsWorkflowCjk(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(String(text || ""));
}

export function containsWorkflowEncodingNoise(text: string): boolean {
  return WORKFLOW_ENCODING_NOISE_RE.test(String(text || ""));
}

export function containsWorkflowUnknownUnsafeChars(text: string): boolean {
  const normalized = normalizeWorkflowArtifactText(text);
  if (!normalized) return false;
  const punctuationNormalized = squeezeWhitespace(normalizeWorkflowPunctuation(normalized));
  return WORKFLOW_DISALLOWED_CHARS_RE.test(punctuationNormalized);
}

export function isWorkflowArtifactEnglishSafe(text: string): boolean {
  const normalized = normalizeWorkflowArtifactText(text);
  if (!normalized) return false;
  if (containsWorkflowCjk(normalized)) return false;
  if (containsWorkflowEncodingNoise(normalized)) return false;
  return WORKFLOW_ALLOWED_CHARS_RE.test(normalized);
}

export function normalizeWorkflowArtifactToEnglishSafe(text: string): string {
  const normalized = normalizeWorkflowArtifactText(text);
  if (!normalized) return "";
  if (isWorkflowArtifactEnglishSafe(normalized)) return normalized;
  const punctuationNormalized = squeezeWhitespace(normalizeWorkflowPunctuation(normalized));
  if (!punctuationNormalized) return "";
  if (isWorkflowArtifactEnglishSafe(punctuationNormalized)) return punctuationNormalized;
  return squeezeWhitespace(punctuationNormalized.replace(WORKFLOW_DISALLOWED_CHARS_GLOBAL_RE, " "));
}

export function sanitizeWorkflowArtifactText(text: string, fallback: string): string {
  const source = normalizeWorkflowArtifactText(text);
  if (!source) return fallback;
  if (containsWorkflowCjk(source)) return fallback;
  if (containsWorkflowUnknownUnsafeChars(source)) return fallback;
  const normalized = normalizeWorkflowArtifactToEnglishSafe(text);
  if (!normalized) return fallback;
  return isWorkflowArtifactEnglishSafe(normalized) ? normalized : fallback;
}

export function sanitizeWorkflowArtifactList(items: string[], fallback: string, separator = " | "): string {
  const filtered = items
    .map((item) => sanitizeWorkflowArtifactText(item, ""))
    .filter((item) => isWorkflowArtifactEnglishSafe(item));
  return filtered.length ? filtered.join(separator) : fallback;
}
