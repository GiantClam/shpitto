import { getPricingPage } from "../../content/pages/pricing";
import { ToolPricingSection } from "../../components/sections/ai-image-tool/tool-pricing-section";
import { ToolFaqSection } from "../../components/sections/ai-image-tool/tool-faq-section";

export default async function PricingPage() {
  const pricingPage = await getPricingPage();
  return (
    <div className="page-shell">
      <section className="hero-block container">
        <p className="eyebrow">Pricing</p>
        <h1>{pricingPage.title}</h1>
        <p className="lead">{pricingPage.lead}</p>
      </section>
      <ToolPricingSection />
      <ToolFaqSection />
    </div>
  );
}
