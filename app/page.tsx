import { Hero } from "@/components/sections/hero";
import { TrustStrip } from "@/components/sections/trust-strip";
import { ProblemSection } from "@/components/sections/problem";
import { WorkflowSection } from "@/components/sections/workflow";
import { VerifySection } from "@/components/sections/verify";
import { AudienceSection } from "@/components/sections/audience";
import { PricingSection } from "@/components/sections/pricing";
import { CtaSection } from "@/components/sections/cta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <ProblemSection />
      <WorkflowSection withSolution />
      <VerifySection />
      <AudienceSection />
      <PricingSection />
      <CtaSection />
    </>
  );
}
