# Blog Prompt Guidance

## Target Blog Index Gate
- Semantic content binding gate: this block is internal implementation instruction, not visitor copy. Do not copy the gate wording into HTML.
- The visible page must not title or describe the section using backend names, API/storage/runtime/hydration/fallback jargon, data-source mechanics, English design jargon, or policy wording unless the nav label is explicitly Blog/博客.
- Attach data-shpitto-blog-root, data-shpitto-blog-api="/api/blog/posts", and data-shpitto-blog-list to the selected page's own content surface rather than to a detached generic Blog block.
- Use the route's own taxonomy for visible collections. For information-platform, knowledge-hub, or publication-library routes, prefer page-specific collection patterns such as case library, standards/documents, research reports, policy/regulation updates, product database entries, publication cards, or insight records according to the source prompt.
- Preview cards must look like native resource/database/report/case cards with type/category, date/status/scope, summary, tags, and /blog/{slug}/ detail links.
- Hidden JSON such as data-fallback-posts is optional support only. It does not replace visible fallback markup. The initial HTML inside [data-shpitto-blog-list] must already render readable cards/rows with direct /blog/{slug}/ anchors before any hydration runs.
- The direct child card/row class inside [data-shpitto-blog-list] must be runtime-safe on its own. If it draws border/background/radius/shadow, that same outer class must include padding and vertical spacing instead of relying only on nested __body/__content wrappers.
- The generated detail style must be reusable by /blog/{slug}/ and should feel like this route's resource/report/case/standard/news detail page, not a detached generic blog template.
- Visitor-facing copy must be final publishable content. Do not explain page mechanics, reading instructions, launch-article counts, metadata fields, backend behavior, or how the list is assembled.
- Do not use headings or paragraphs such as reading method, suggested reading order, reading path, AI reading path, what you'll find, start with these three articles, article collection, this page collects, each article includes date/read time/tags, or their Chinese equivalents.
- Hero copy and section ledes must make a substantive claim, insight, or editorial thesis about the subject itself. Do not write guide-the-reader sentences like "这里收纳三种最常见也最实用的 AI 阅读路径" or "建议先读这三篇".

## Target Blog Count Gate
- The source request asks for {{REQUESTED_CONTENT_COUNT}} publishable content item(s). This index must expose exactly {{REQUESTED_CONTENT_COUNT}} substantial native cards with stable /blog/{slug}/ links, and those links must correspond to complete article/detail pages emitted as static HTML files.
- The requested count ({{REQUESTED_CONTENT_COUNT}}) is an internal delivery constraint only. Do not announce it in hero copy, meta descriptions, section headings, helper text, or return links with phrasing like three articles, three launch articles, here are three complete articles, or three ways into the topic.
- Cards are summaries only; do not stop at title/metadata/excerpt. The corresponding detail pages must contain complete body prose with sections and paragraphs strongly grounded in the user's topic.

## Target Blog Detail Gate
- Blog detail page gate: this file is a required publishable article/detail target for a visible /blog/{slug}/ entry.
- Write a complete visitor-facing article, not a title-only page, not a list card, and not an explanation of the Blog system.
- Include a page-specific title, date/category metadata if useful, at least three substantial body paragraphs, and section headings that answer the topic directly.
- Expand the exact visible list-card topic. Reuse the user's real subject matter, named entities, source-document themes, or route-specific tension instead of drifting into generic implementation/process filler.
- Keep the article strongly related to the user's supplied subject and site positioning. If factual/current examples are needed and not in the prompt, the workflow should use web research before drafting rather than inventing weak filler.
