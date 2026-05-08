import { describe, expect, it } from "vitest";
import {
  buildBlogExcerpt,
  normalizeBlogMarkdown,
  normalizeBlogSlug,
  renderMarkdownToHtml,
  resolveUniqueBlogSlug,
  stripMarkdown,
} from "./blog-markdown";

describe("blog helpers", () => {
  it("normalizes slugs from titles", () => {
    expect(normalizeBlogSlug("Hello World!")).toBe("hello-world");
    expect(normalizeBlogSlug("", "Draft Post")).toBe("draft-post");
  });

  it("deduplicates slugs with numeric suffixes", () => {
    expect(resolveUniqueBlogSlug("hello-world", [])).toBe("hello-world");
    expect(resolveUniqueBlogSlug("hello-world", ["hello-world"])).toBe("hello-world-2");
    expect(resolveUniqueBlogSlug("hello-world", ["hello-world", "hello-world-2", "hello-world-3"])).toBe(
      "hello-world-4",
    );
    expect(resolveUniqueBlogSlug("hello-world-2", ["hello-world-2"])).toBe("hello-world-2-2");
  });

  it("renders markdown into html for public pages", () => {
    const html = renderMarkdownToHtml("# Title\n\n- One\n- Two\n\n> Quote");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul><li>One</li><li>Two</li></ul>");
    expect(html).toContain("<blockquote>Quote</blockquote>");
  });

  it("rejects unsafe markdown link and image protocols", () => {
    const html = renderMarkdownToHtml("[bad](javascript:alert(1))\n\n![x](data:text/html,hi)");
    expect(html).toContain('<a href="#" rel="noreferrer noopener">bad</a>');
    expect(html).toContain('<img src="#" alt="x" />');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
  });

  it("strips markdown for excerpt generation", () => {
    const markdown = "## Heading\n\nThis is **bold** text with a [link](https://example.com).";
    expect(stripMarkdown(markdown)).toContain("This is bold text");
    expect(buildBlogExcerpt(markdown, 40)).toMatch(/This is bold text/);
  });

  it("normalizes milkdown break placeholders before excerpt and render", () => {
    const markdown = "# Title\n\n<br />\n\n## Section\n\nBody line.\n\n<br />\n";
    expect(normalizeBlogMarkdown(markdown)).toBe("# Title\n\n## Section\n\nBody line.");
    expect(stripMarkdown(markdown)).toBe("Title Section Body line.");
    expect(buildBlogExcerpt(markdown)).toBe("Title Section Body line.");
    expect(renderMarkdownToHtml(markdown)).not.toContain("&lt;br /&gt;");
  });
});
