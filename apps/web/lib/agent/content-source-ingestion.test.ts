import { describe, expect, it } from "vitest";
import { __contentSourceIngestionForTesting, formatWebsiteKnowledgeProfile } from "./content-source-ingestion";
import { __documentIngestionForTesting, extractDocumentContentFromBytes } from "./document-ingestion";
import { containsWorkflowCjk, isWorkflowArtifactEnglishSafe } from "../workflow-artifact-language.ts";

describe("content source ingestion", () => {
  it("loads the Node PDF parser build without relying on browser canvas globals", () => {
    expect("DOMMatrix" in globalThis).toBe(false);

    const pdfParseModule = __documentIngestionForTesting.loadPdfParseModule();

    expect(typeof pdfParseModule.PDFParse).toBe("function");
  });

  it("does not accept raw PDF internals as extracted document text", () => {
    const pdfDump = Buffer.from(
      "%PDF-1.4 1 0 obj <</Type /Page /Filter /FlateDecode>> stream xœ binary compressed bytes endstream endobj xref trailer",
      "latin1",
    );

    const extracted = __contentSourceIngestionForTesting.extractTextFromUploadedBytes({
      body: new Uint8Array(pdfDump),
      contentType: "application/pdf",
      fileName: "CASUX_.md.pdf",
    });

    expect(extracted.text).toBe("");
    expect(extracted.unsupportedReason).toContain("binary_dump");
  });

  it("extracts PPTX slide text locally instead of requiring direct model file parsing", async () => {
    const jszipModule = await import("jszip");
    const JSZip = (jszipModule as any).default || jszipModule;
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>CASUX smart seating</a:t><a:t>Custom solutions for classrooms</a:t></p:sld>");
    const body = await zip.generateAsync({ type: "uint8array" });

    const extracted = await extractDocumentContentFromBytes({
      body,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileName: "Company deck.pptx",
    });

    expect(extracted.status).toBe("ready");
    expect(extracted.parser).toBe("local_pptx");
    expect(extracted.text).toContain("CASUX smart seating");
  });

  it("extracts XLSX workbook text locally", async () => {
    const jszipModule = await import("jszip");
    const JSZip = (jszipModule as any).default || jszipModule;
    const zip = new JSZip();
    zip.file(
      "xl/workbook.xml",
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<sheets><sheet name="Offerings" sheetId="1" r:id="rId1"/></sheets>',
        "</workbook>",
      ].join(""),
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    zip.file(
      "xl/sharedStrings.xml",
      [
        "<sst>",
        "<si><t>Product</t></si>",
        "<si><t>Audience</t></si>",
        "<si><t>Smart desk</t></si>",
        "<si><t>International schools</t></si>",
        "</sst>",
      ].join(""),
    );
    zip.file(
      "xl/worksheets/sheet1.xml",
      [
        "<worksheet><sheetData>",
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>',
        "</sheetData></worksheet>",
      ].join(""),
    );
    const body = await zip.generateAsync({ type: "uint8array" });

    const extracted = await extractDocumentContentFromBytes({
      body,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: "catalog.xlsx",
    });

    expect(extracted.status).toBe("ready");
    expect(extracted.parser).toBe("local_xlsx");
    expect(extracted.text).toContain("Smart desk");
  });

  it("keeps uploaded material identity ahead of unrelated web-search titles", () => {
    const profile = __contentSourceIngestionForTesting.buildKnowledgeProfile({
      requirementText: "Use the uploaded PDF document to generate the website.",
      domains: [],
      contentGaps: ["CASUX_.md.pdf could not be parsed as text."],
      sources: [
        {
          type: "web_search",
          title: "Claude.ai Chinese localization script - Greasy Fork",
          url: "https://greasyfork.org/scripts/example",
          snippet:
            "A browser userscript for localization and usage display. This source is unrelated to the uploaded project material and should not define the brand.",
          confidence: 0.78,
        },
        {
          type: "uploaded_file",
          title: "CASUX_.md.pdf",
          fileName: "CASUX_.md.pdf",
          snippet: "Asset reference only",
          confidence: 0.5,
        },
      ],
    });

    expect(profile.sourceMode).toBe("uploaded_files");
    expect(profile.brand.name).toBe("CASUX");
    expect(profile.brand.name).not.toContain("Greasy");
    expect(profile.summary).not.toContain("Greasy Fork");
  });

  it("skips generic web search when uploaded materials are the primary source and no domain is provided", () => {
    expect(
      __contentSourceIngestionForTesting.shouldSkipGenericSearchForUploadedMaterials({
        requirementText: "Use the uploaded PDF document to generate a website.",
        domains: [],
        referencedAssets: ['Asset "CASUX_.md.pdf" path: uploads/CASUX_.md.pdf'],
      }),
    ).toBe(true);
  });

  it("promotes explicit uploaded-document navigation over generic company pages", () => {
    const profile = __contentSourceIngestionForTesting.buildKnowledgeProfile({
      requirementText: "根据上传的 CASUX_.md.pdf 生成网站。",
      domains: [],
      contentGaps: [],
      sources: [
        {
          type: "uploaded_file",
          title: "CASUX_.md.pdf",
          fileName: "CASUX_.md.pdf",
          confidence: 0.9,
          snippet: [
            "CASUX 网站完整页面生成提示词",
            "主导航菜单（从左到右）： 首页 | CASUX创设 | CASUX建设 | CASUX优标 | CASUX倡导 | CASUX研究中心 | CASUX信息平台 | 资料下载",
            "用户注册/登录页面：source.casux.org.cn",
          ].join("\n"),
        },
      ],
    });

    expect(profile.suggestedPages.map((page) => page.route)).toEqual([
      "/",
      "/casux-creation",
      "/casux-construction",
      "/casux-certification",
      "/casux-advocacy",
      "/casux-research-center",
      "/casux-information-platform",
      "/downloads",
    ]);
    expect(profile.suggestedPages.map((page) => page.route)).not.toContain("/custom-solutions");
    expect(profile.contentGaps.join(" ")).toMatch(/user registration\/login|Proof points are missing/i);
  });

  it("uses readable uploaded PDF content before file-name metadata", () => {
    const profile = __contentSourceIngestionForTesting.buildKnowledgeProfile({
      requirementText: "根据上传的 CASUX_.md.pdf 生成网站。",
      domains: [],
      contentGaps: [],
      sources: [
        {
          type: "uploaded_file",
          title: "CASUX_.md.pdf",
          fileName: "CASUX_.md.pdf",
          confidence: 0.9,
          snippet: [
            "请生成一个名为\"CASUX\"（适儿化改造标准体系）的专业机构官网。",
            "主导航菜单（从左到右）： 首页 | CASUX创设 | CASUX建设 | CASUX优标 | CASUX倡导 | CASUX研究中心 | CASUX信息平台 | 资料下载",
            "视觉风格：以清新的绿色（#2E8B57 生态绿）和白色为主色调，搭配暖橙色作为点缀。",
          ].join("\n"),
        },
      ],
    });

    expect(profile.brand.name).toBe("CASUX");
    expect(profile.brand.name).not.toBe("CASUX_.md.pdf");
    expect(profile.suggestedPages.map((page) => page.route)).toEqual([
      "/",
      "/casux-creation",
      "/casux-construction",
      "/casux-certification",
      "/casux-advocacy",
      "/casux-research-center",
      "/casux-information-platform",
      "/downloads",
    ]);
  });

  it("keeps knowledge profile artifacts English-safe when source titles and snippets are multilingual", () => {
    const rendered = formatWebsiteKnowledgeProfile({
      sourceMode: "uploaded_files",
      domains: [],
      sources: [
        {
          type: "uploaded_file",
          title: "适儿空间资料包.pdf",
          fileName: "适儿空间资料包.pdf",
          snippet: "适儿空间标准、评分体系、研究中心与资料下载。",
          confidence: 0.91,
        },
      ],
      brand: { name: "适儿空间" },
      audience: ["0-12 岁儿童家庭"],
      offerings: ["空间评估", "认证服务"],
      differentiators: ["研究标准"],
      proofPoints: ["标准样本"],
      suggestedPages: [
        {
          route: "/downloads",
          title: "资料下载",
          purpose: "资料下载页面",
          contentInputs: ["标准文档"],
        },
      ],
      contentGaps: ["缺少英文案例内容"],
      summary: "适儿空间资料包",
    });

    expect(rendered).toContain("## Website Knowledge Profile");
    expect(rendered).toContain("Brand: source-defined brand available in uploaded/domain material");
    expect(rendered).toContain("[uploaded_file] Source 1");
    expect(rendered).toContain("multilingual source text stored in extracted source artifacts");
    expect(containsWorkflowCjk(rendered)).toBe(false);
    expect(isWorkflowArtifactEnglishSafe(rendered)).toBe(true);
  });
});
