import { getWorkflowCards } from "../../../content/collections/workflow-cards";

export async function ToolWorkflow() {
  const workflowCards = await getWorkflowCards();
  return (
    <section className="container section-stack">
      <article className="section-card workflow-shell">
          <p className="eyebrow">{workflowCards[0]?.title || "How it works"}</p>
          <div className="workflow-shell__body">
            <div className="workflow-shell__visual checkerboard" />
            <div className="workflow-list">
            {workflowCards.map((item) => (
              <article key={item.title} className="workflow-item">
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
            </div>
          </div>
      </article>
    </section>
  );
}
