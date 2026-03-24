import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import HealthDashboard from "@/components/HealthDashboard";
import Footer from "@/components/Footer";
import dynamic from "next/dynamic";

const CompatibilityGraph = dynamic(() => import("@/components/CompatibilityGraph"), { loading: () => <SectionFallback /> });
const CodeGenerator = dynamic(() => import("@/components/CodeGenerator"), { loading: () => <SectionFallback /> });
const DocSearch = dynamic(() => import("@/components/DocSearch"), { loading: () => <SectionFallback /> });

function SectionFallback() {
  return (
    <div className="py-24 px-6 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background relative">
      <Navbar />
      <HeroSection />
      <div className="divider-gradient" />
      <HealthDashboard />
      <div className="divider-gradient" />
      <CompatibilityGraph />
      <div className="divider-gradient" />
      <CodeGenerator />
      <div className="divider-gradient" />
      <DocSearch />
      <Footer />
    </div>
  );
}
