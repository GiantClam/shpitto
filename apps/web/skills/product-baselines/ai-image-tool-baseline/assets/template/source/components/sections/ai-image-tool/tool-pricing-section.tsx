import { getPlans } from "../../../content/collections/plans";

export async function ToolPricingSection() {
  const plans = await getPlans();
  return (
    <section className="container section-stack">
      <div className="card-grid">
        {plans.map((plan) => (
          <article key={plan.name} className="section-card pricing-card">
            <h2>{plan.name}</h2>
            <p>{plan.summary}</p>
            <p><strong>{plan.price}</strong>{plan.interval}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
