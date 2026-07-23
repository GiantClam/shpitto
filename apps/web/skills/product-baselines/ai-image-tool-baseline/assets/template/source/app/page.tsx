import { ToolHero } from "../components/sections/ai-image-tool/tool-hero";
import { ToolFeatureGrid } from "../components/sections/ai-image-tool/tool-feature-grid";
import { ToolWorkflow } from "../components/sections/ai-image-tool/tool-workflow";
import { ToolExamples } from "../components/sections/ai-image-tool/tool-examples";
import { ToolPricingSection } from "../components/sections/ai-image-tool/tool-pricing-section";
import { ToolFaqSection } from "../components/sections/ai-image-tool/tool-faq-section";
import { SchnellIntroPanel } from "../components/sections/ai-image-tool/schnell-intro-panel";

export default function HomePage() {
  return (
    <div className="page-shell">
      <ToolHero />
      <SchnellIntroPanel />
      <ToolPricingSection />
      <ToolFeatureGrid />
      <ToolWorkflow />
      <ToolExamples />
      <ToolFaqSection />
    </div>
  );
}
