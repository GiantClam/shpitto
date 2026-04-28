export type DocumentExtractionStatus = "ready" | "unsupported" | "failed";

export type DocumentExtractionResult = {
  status: DocumentExtractionStatus;
  text: string;
  parser:
    | "deterministic_text"
    | "local_pdf"
    | "local_docx"
    | "local_xlsx"
    | "local_pptx"
    | "unsupported"
    | "failed";
  confidence: number;
  unsupportedReason?: string;
  gaps: string[];
};

type ExtractParams = {
  body: Uint8Array;
  contentType: string;
  fileName: string;
  timeoutMs?: number;
};

function normalizeText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  return normalizeText(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'"),
  );
}

function decodeXmlEntities(text: string): string {
  return normalizeText(
    String(text || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
      .replace(/&#x([a-f0-9]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16))),
  );
}

function decodeXmlEntitiesPreserveCellText(text: string): string {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([a-f0-9]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)));
}

function stripXmlTags(value: string): string {
  return decodeXmlEntitiesPreserveCellText(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extensionOf(fileName: string): string {
  return String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function isTextLikeAsset(contentType: string, fileName: string): boolean {
  const lowerType = contentType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (isOfficeAsset(contentType, fileName)) return false;
  return (
    lowerType.startsWith("text/") ||
    /(^|[+/;-])(json|xml|csv|markdown|html|svg)([+/;-]|$)/.test(lowerType) ||
    /\.(txt|md|csv|json|html?|xml|svg)$/i.test(lowerName)
  );
}

function isPdfAsset(contentType: string, fileName: string): boolean {
  return extensionOf(fileName) === "pdf" || /application\/pdf/i.test(contentType);
}

function isDocxAsset(contentType: string, fileName: string): boolean {
  return extensionOf(fileName) === "docx" || /wordprocessingml\.document/i.test(contentType);
}

function isXlsxAsset(contentType: string, fileName: string): boolean {
  return /^(xlsx|xls)$/i.test(extensionOf(fileName)) || /spreadsheet|excel/i.test(contentType);
}

function isPptxAsset(contentType: string, fileName: string): boolean {
  return extensionOf(fileName) === "pptx" || /presentationml\.presentation/i.test(contentType);
}

function isOfficeAsset(contentType: string, fileName: string): boolean {
  const lowerType = contentType.toLowerCase();
  return (
    /\.(docx?|pptx?|xlsx?)$/i.test(fileName) ||
    /msword|officedocument|powerpoint|spreadsheet|excel/i.test(lowerType)
  );
}

function looksLikeRawPdfInternals(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return false;
  const markers = [
    "%pdf",
    "/flatedecode",
    "/type /page",
    "/type/page",
    " endobj",
    " obj ",
    " stream ",
    " endstream",
    " xref",
    "trailer",
  ];
  const hitCount = markers.reduce((count, marker) => count + (normalized.includes(marker) ? 1 : 0), 0);
  return normalized.startsWith("%pdf") || hitCount >= 2;
}

function hasUsefulNaturalText(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length < 40) return false;
  if (looksLikeRawPdfInternals(normalized)) return false;
  const wordHits = normalized.match(/[a-zA-Z]{3,}|[\u4e00-\u9fff]{2,}/g) || [];
  return wordHits.length >= 5;
}

function resolveMaxFileBytes(): number {
  const mb = Number(process.env.DOCUMENT_INGESTION_MAX_FILE_MB || 25);
  const boundedMb = Number.isFinite(mb) ? Math.max(1, Math.min(80, mb)) : 25;
  return boundedMb * 1024 * 1024;
}

function resolveDocumentIngestionEnabled(): boolean {
  return !/^(0|false|off|disabled)$/i.test(String(process.env.DOCUMENT_INGESTION_ENABLED || "1"));
}

function resolveDocumentIngestionProvider(): string {
  return normalizeText(process.env.DOCUMENT_INGESTION_PROVIDER || "local").toLowerCase();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`document_ingestion_timeout_${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function successResult(params: {
  text: string;
  parser: DocumentExtractionResult["parser"];
  confidence: number;
}): DocumentExtractionResult {
  const text = normalizeText(params.text).slice(0, 8000);
  if (!hasUsefulNaturalText(text)) {
    return {
      status: "unsupported",
      text: "",
      parser: params.parser,
      confidence: 0.2,
      unsupportedReason: "empty_or_too_little_text",
      gaps: ["The file parser ran, but it did not produce enough readable text for website planning."],
    };
  }
  return {
    status: "ready",
    text,
    parser: params.parser,
    confidence: params.confidence,
    gaps: [],
  };
}

function unsupportedResult(fileName: string, reason: string, message: string): DocumentExtractionResult {
  return {
    status: "unsupported",
    text: "",
    parser: "unsupported",
    confidence: 0.1,
    unsupportedReason: reason,
    gaps: [message],
  };
}

export function extractDeterministicTextFromDocumentBytes(params: ExtractParams): DocumentExtractionResult {
  const { body, contentType, fileName } = params;
  if (isTextLikeAsset(contentType, fileName)) {
    const raw = Buffer.from(body).toString("utf8");
    const text = htmlToText(raw) || normalizeText(raw).slice(0, 4000);
    return successResult({ text, parser: "deterministic_text", confidence: 0.9 });
  }

  if (isPdfAsset(contentType, fileName)) {
    const rough = Buffer.from(body)
      .toString("latin1")
      .replace(/[^\x20-\x7E\u4e00-\u9fff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2400);
    if (!hasUsefulNaturalText(rough)) {
      return unsupportedResult(
        fileName,
        "pdf_text_extraction_insufficient_or_binary_dump",
        `${fileName} needs local PDF parsing because deterministic extraction did not produce readable text.`,
      );
    }
    return successResult({ text: rough, parser: "deterministic_text", confidence: 0.65 });
  }

  return unsupportedResult(fileName, "deterministic_parser_not_applicable", `${fileName} requires a document parser.`);
}

async function extractPdfLocally(params: ExtractParams): Promise<DocumentExtractionResult> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(params.body) });
  try {
    const result = await parser.getText();
    return successResult({ text: result.text || "", parser: "local_pdf", confidence: 0.9 });
  } finally {
    await parser.destroy();
  }
}

async function extractDocxLocally(params: ExtractParams): Promise<DocumentExtractionResult> {
  const mammothModule = await import("mammoth");
  const mammoth = (mammothModule as any).default || mammothModule;
  const result = await mammoth.extractRawText({ buffer: Buffer.from(params.body) });
  return successResult({ text: result.value || "", parser: "local_docx", confidence: 0.9 });
}

async function extractXlsxLocally(params: ExtractParams): Promise<DocumentExtractionResult> {
  const jszipModule = await import("jszip");
  const JSZip = (jszipModule as any).default || jszipModule;
  const zip = await JSZip.loadAsync(Buffer.from(params.body));

  const sharedStringsXml = zip.file("xl/sharedStrings.xml")
    ? String(await zip.file("xl/sharedStrings.xml")?.async("string"))
    : "";
  const sharedStrings = Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)).map((match) =>
    stripXmlTags(match[1]),
  );

  const workbookXml = zip.file("xl/workbook.xml")
    ? String(await zip.file("xl/workbook.xml")?.async("string"))
    : "";
  const relationshipXml = zip.file("xl/_rels/workbook.xml.rels")
    ? String(await zip.file("xl/_rels/workbook.xml.rels")?.async("string"))
    : "";
  const relationTargets = new Map<string, string>();
  for (const match of relationshipXml.matchAll(/<Relationship\b([^>]*?)\/?>/gi)) {
    const attrs = match[1] || "";
    const id = attrs.match(/\bId=["']([^"']+)["']/i)?.[1];
    const target = attrs.match(/\bTarget=["']([^"']+)["']/i)?.[1];
    if (id && target) relationTargets.set(id, target.replace(/^\/+/, ""));
  }

  const workbookSheets = Array.from(workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/gi)).map((match, index) => {
    const attrs = match[1] || "";
    const name = decodeXmlEntitiesPreserveCellText(attrs.match(/\bname=["']([^"']+)["']/i)?.[1] || `Sheet ${index + 1}`).trim();
    const relationshipId = attrs.match(/\br:id=["']([^"']+)["']/i)?.[1] || "";
    const target = relationshipId ? relationTargets.get(relationshipId) : "";
    const normalizedTarget = target
      ? target.startsWith("xl/") ? target : `xl/${target}`
      : `xl/worksheets/sheet${index + 1}.xml`;
    return { name, path: normalizedTarget.replace(/\\/g, "/") };
  });

  const sheetEntries = workbookSheets.length > 0
    ? workbookSheets
    : Object.keys(zip.files)
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
        .sort((left, right) => Number(left.match(/sheet(\d+)/i)?.[1] || 0) - Number(right.match(/sheet(\d+)/i)?.[1] || 0))
        .map((path, index) => ({ name: `Sheet ${index + 1}`, path }));

  const sheetTexts: string[] = [];
  for (const sheetEntry of sheetEntries.slice(0, 8)) {
    const sheetFile = zip.file(sheetEntry.path);
    if (!sheetFile) continue;
    const sheetXml = String(await sheetFile.async("string"));
    const rows: string[] = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      const cells = Array.from(rowMatch[1].matchAll(/<c\b([^>]*?)>([\s\S]*?)<\/c>/gi))
        .map((cellMatch) => {
          const attrs = cellMatch[1] || "";
          const body = cellMatch[2] || "";
          const cellType = attrs.match(/\bt=["']([^"']+)["']/i)?.[1] || "";
          if (cellType === "inlineStr") {
            return stripXmlTags(body);
          }
          const rawValue = body.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "";
          if (!rawValue) return "";
          if (cellType === "s") {
            const index = Number(rawValue);
            return Number.isInteger(index) ? sharedStrings[index] || "" : "";
          }
          return decodeXmlEntitiesPreserveCellText(rawValue).trim();
        })
        .map((cell) => String(cell || "").trim())
        .filter(Boolean);
      if (cells.length > 0) rows.push(cells.join(","));
    }
    if (rows.length > 0) sheetTexts.push(`# ${sheetEntry.name}\n${rows.join("\n")}`);
  }
  return successResult({ text: sheetTexts.join("\n\n"), parser: "local_xlsx", confidence: 0.86 });
}

async function extractPptxLocally(params: ExtractParams): Promise<DocumentExtractionResult> {
  const jszipModule = await import("jszip");
  const JSZip = (jszipModule as any).default || jszipModule;
  const zip = await JSZip.loadAsync(Buffer.from(params.body));
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const a = Number(left.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const b = Number(right.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return a - b;
    })
    .slice(0, 80);
  const slides: string[] = [];
  for (const name of slideNames) {
    const slideFile = zip.file(name);
    if (!slideFile) continue;
    const xml = String(await slideFile.async("string"));
    const text = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi))
      .map((match) => decodeXmlEntities(match[1]))
      .filter(Boolean)
      .join(" ");
    if (text) slides.push(`Slide ${slides.length + 1}: ${text}`);
  }
  return successResult({ text: slides.join("\n"), parser: "local_pptx", confidence: 0.78 });
}

export async function extractDocumentContentFromBytes(params: ExtractParams): Promise<DocumentExtractionResult> {
  if (params.body.byteLength > resolveMaxFileBytes()) {
    return unsupportedResult(
      params.fileName,
      "file_too_large_for_local_parsing",
      `${params.fileName} is too large for local document ingestion. Split it or upload a smaller source file.`,
    );
  }

  const deterministic = extractDeterministicTextFromDocumentBytes(params);
  if (deterministic.status === "ready") return deterministic;
  if (!resolveDocumentIngestionEnabled()) {
    return unsupportedResult(
      params.fileName,
      "document_ingestion_disabled",
      `${params.fileName} requires local document parsing, but DOCUMENT_INGESTION_ENABLED is disabled.`,
    );
  }
  if (resolveDocumentIngestionProvider() !== "local") {
    return unsupportedResult(
      params.fileName,
      "unsupported_document_ingestion_provider",
      `${params.fileName} requires local document parsing, but DOCUMENT_INGESTION_PROVIDER is not set to local.`,
    );
  }

  const timeoutMs = Math.max(5_000, Math.min(90_000, Number(params.timeoutMs || process.env.DOCUMENT_INGESTION_TIMEOUT_MS || 45_000)));
  try {
    if (isPdfAsset(params.contentType, params.fileName)) {
      return await withTimeout(extractPdfLocally(params), timeoutMs);
    }
    if (isDocxAsset(params.contentType, params.fileName)) {
      return await withTimeout(extractDocxLocally(params), timeoutMs);
    }
    if (isXlsxAsset(params.contentType, params.fileName)) {
      return await withTimeout(extractXlsxLocally(params), timeoutMs);
    }
    if (isPptxAsset(params.contentType, params.fileName)) {
      return await withTimeout(extractPptxLocally(params), timeoutMs);
    }
    if (isOfficeAsset(params.contentType, params.fileName)) {
      return unsupportedResult(
        params.fileName,
        "legacy_office_binary_parser_not_configured",
        `${params.fileName} uses a legacy Office binary format. Upload DOCX, PPTX, XLSX, PDF, or text export.`,
      );
    }
    return deterministic;
  } catch (error) {
    return {
      status: "failed",
      text: "",
      parser: "failed",
      confidence: 0.1,
      unsupportedReason: "local_document_parser_failed",
      gaps: [`${params.fileName} local document parsing failed: ${error instanceof Error ? error.message : "unknown error"}`],
    };
  }
}
