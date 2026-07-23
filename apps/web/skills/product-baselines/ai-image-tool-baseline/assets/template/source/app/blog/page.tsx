import { blogPage } from "../../content/pages/blog";
import { getExamples } from "../../content/collections/examples";

export default async function BlogPage() {
  const examples = await getExamples();
  return (
    <div className="page-shell">
      <section className="hero-block container">
        <p className="eyebrow">Blog</p>
        <h1>{blogPage.title}</h1>
        <p className="lead">{blogPage.lead}</p>
      </section>
      <div className="card-grid">
        {examples.map((item) => (
          <article key={item.title} className="section-card">
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
