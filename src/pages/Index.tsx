import { lazy, Suspense } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import AgentGuardHomeCard from "@/components/AgentGuardHomeCard";
import HealthDashboard from "@/components/HealthDashboard";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";
import HomeSeoContent from "@/components/HomeSeoContent";

const CompatibilityGraph = lazy(() => import("@/components/CompatibilityGraph"));
const CodeGenerator = lazy(() => import("@/components/CodeGenerator"));
const DocSearch = lazy(() => import("@/components/DocSearch"));

const SectionFallback = () => (
  <div className="py-24 px-6 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <Navbar />
      <HeroSection />
      <div className="divider-gradient" />
      <AgentGuardHomeCard />
      <div className="divider-gradient" />
      <HealthDashboard />
      <div className="divider-gradient" />
      <Suspense fallback={<SectionFallback />}>
        <CompatibilityGraph />
      </Suspense>
      <div className="divider-gradient" />
      <Suspense fallback={<SectionFallback />}>
        <CodeGenerator />
      </Suspense>
      <div className="divider-gradient" />
      <Suspense fallback={<SectionFallback />}>
        <DocSearch />
      </Suspense>
      <div className="divider-gradient" />
      <HomeSeoContent />
      <div className="divider-gradient" />
      <PricingSection />
      <div className="divider-gradient" />
      <Footer />
    </div>
  );
};

export default Index;
