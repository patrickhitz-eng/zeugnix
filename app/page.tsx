import { Hero } from "@/components/sections/hero";
import { ProblemSection } from "@/components/sections/problem";
import { SolutionSection } from "@/components/sections/solution";
import { WorkflowSection } from "@/components/sections/workflow";
import { VerifySection } from "@/components/sections/verify";
import { AudienceSection } from "@/components/sections/audience";
import { PricingSection } from "@/components/sections/pricing";
import { BadgeSection } from "@/components/sections/badge";
import { CtaSection } from "@/components/sections/cta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <WorkflowSection />
      <VerifySection />
      <AudienceSection />
      <PricingSection />
      <BadgeSection />
      <CtaSection />
    </>
  );
}
