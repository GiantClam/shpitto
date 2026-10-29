import { getFeatures } from "../../../content/collections/features";

export async function ToolFeatureGrid() {
  const features = await getFeatures();
  return (
    <section className="container section-stack">
      <div className="feature-band">
        {features.map((feature) => (
          <article key={feature.title} className="section-card feature-card">
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
