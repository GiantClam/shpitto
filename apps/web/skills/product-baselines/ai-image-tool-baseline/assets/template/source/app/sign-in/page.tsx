import { Suspense } from "react";
import { SignInGate } from "../../components/sections/ai-image-tool/sign-in-gate";
import { ToolFaqSection } from "../../components/sections/ai-image-tool/tool-faq-section";

export default function SignInPage() {
  return (
    <div className="page-shell">
      <Suspense fallback={null}>
        <SignInGate />
      </Suspense>
      <ToolFaqSection />
    </div>
  );
}
