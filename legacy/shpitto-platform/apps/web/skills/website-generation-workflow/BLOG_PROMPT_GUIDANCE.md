# Blog Prompt Guidance

## Target Blog Index Gate
- Semantic content binding gate: this block is internal implementation instruction, not visitor copy. Do not copy the gate wording into HTML.
- The visible page must not title or describe the section using backend names, API/storage/runtime/hydration/fallback jargon, data-source mechanics, English design jargon, or policy wording unless the nav label is explicitly Blog.
- Attach `data-shpitto-blog-root`, `data-shpitto-blog-api="/api/blog/posts"`, and `data-shpitto-blog-list` to the selected page's own content surface rather than to a detached generic Blog block.
- Use the route's own taxonomy for visible collections. For information-platform, knowledge-hub, standards, research, or publication-library routes, prefer page-specific collection patterns such as case libraries, standards/documents, research reports, policy/regulation updates, product database entries, publication cards, or insight records according to the source prompt.
- Preview cards must look like native resource/database/report/case cards with type/category, date/status/scope, summary, and tags. Add `/blog/{slug}/` detail links only when the route is an explicit Blog/News/Articles archive or when the prompt/source explicitly asks for publishable detail pages.
- If the user did not request a specific article/resource count, render exactly 3 fallback cards by default. Do not expand a simple personal Blog into 5-6 inferred articles just because several topic tokens appear in the prompt.
- Hidden JSON such as `data-fallback-posts` is optional support only. It does not replace visible fallback markup. The initial HTML inside `[data-shpitto-blog-list]` must already render readable cards/rows before any hydration runs.
- For explicit Blog/News/Articles archives or explicitly requested publishable detail pages, same-page anchors, accordions, hidden panels, or detail sections embedded below the index are not valid detail deliverables. Use `/blog/{slug}/` links and emit matching `/blog/{slug}/index.html` files.
- For generic information-platform, knowledge-hub, standards, research, or resource-collection routes, keep the initial pass focused on the collection surface. Do not invent `/blog/{slug}/` links or matching detail files unless the prompt, route identity, or source material explicitly asks for publishable article/news details.
- Fallback/no-JS/deployment compatibility markup is a rendering safety net only, not a content source chain. Do not derive Blog posts, homepage copy, or detail-page copy from previously generated HTML, placeholder fallback cards, route summaries, or template examples. Use the confirmed prompt, uploaded/source material, Evidence Brief, explicit user content, or confirmed content workflow posts.
- The direct child card/row class inside `[data-shpitto-blog-list]` must be runtime-safe on its own. If it draws border/background/radius/shadow, that same outer class must include padding and vertical spacing instead of relying only on nested `__body` or `__content` wrappers.
- The generated detail style, when detail pages are required, must be reusable by `/blog/{slug}/` and should feel like this route's resource/report/case/standard/news detail page, not a detached generic blog template.
- Visitor-facing copy must be final publishable content. Do not explain page mechanics, reading instructions, launch-article counts, metadata fields, backend behavior, or how the list is assembled.
- Do not use headings or paragraphs such as reading method, suggested reading order, reading path, what you'll find here, start with these three articles, article collection, this page collects, or each article includes date/read time/tags.
- Do not use whole-site route choreography such as start from home, where to start, next step, homepage job, or similar browsing-order explanations instead of a concrete CTA.
- Hero copy and section ledes must make a substantive claim, insight, or editorial thesis about the subject itself. Do not write guide-the-reader sentences that merely explain how to browse the collection.

## Target Blog Count Gate
- The source request asks for `{{REQUESTED_CONTENT_COUNT}}` publishable content item(s). This index must expose exactly `{{REQUESTED_CONTENT_COUNT}}` substantial native cards.
- If the route is an explicit Blog/News/Articles archive or the prompt explicitly requests publishable detail pages, those cards must use stable `/blog/{slug}/` links, and those links must correspond to complete article/detail pages emitted as static HTML files.
- The requested count is an internal delivery constraint only. Do not announce it in hero copy, meta descriptions, section headings, helper text, or return links with phrasing like three articles, three launch articles, or three ways into the topic.
- Cards are summaries only; when detail pages are required, the corresponding detail pages must contain complete body prose with sections and paragraphs strongly grounded in the user's topic.

## Target Blog Detail Gate
- Blog detail page gate: this file is a required publishable article/detail target for a visible `/blog/{slug}/` entry.
- Write a complete visitor-facing article, not a title-only page, not a list card, and not an explanation of the Blog system.
- Include a page-specific title, date/category metadata if useful, at least three substantial body paragraphs, and section headings that answer the topic directly.
- Expand the exact visible list-card topic. Reuse the user's real subject matter, named entities, source-document themes, or route-specific tension instead of drifting into generic implementation/process filler.
- Keep the article strongly related to the user's supplied subject and site positioning. If factual/current examples are needed and not in the prompt, the workflow should use web research before drafting rather than inventing weak filler.
