import { getFaq } from "../../../content/collections/faq";

export async function ToolFaqSection() {
  const faq = await getFaq();
  return (
    <section className="container section-stack">
      <div className="card-grid">
        {faq.map((item) => (
          <article key={item.question} className="section-card faq-card">
            <h2>{item.question}</h2>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
