import { PricingSection } from "@/components/sections/pricing";

export const metadata = {
  title: "Preise",
  description: "Faire, transparente Preise für Erstellung, Prüfung und Analyse von Schweizer Arbeitszeugnissen.",
};

export default function PricingPage() {
  return (
    <div className="py-12">
      <PricingSection />
    </div>
  );
}
