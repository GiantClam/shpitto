import { getExamples } from "../../../content/collections/examples";

export async function ToolExamples() {
  const examples = await getExamples();
  return (
    <section className="container section-stack">
      <div className="history-grid">
        {examples.map((item) => (
          <article key={item.title} className="history-card example-card">
            <div className="history-thumb checkerboard"><span className="apple-tag history-thumb__tag">{item.title}</span></div>
            <div className="history-meta">
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
