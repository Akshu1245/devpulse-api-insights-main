import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://www.devpluse.in";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.svg`;

type RouteSeo = {
  title: string;
  description: string;
  noindex?: boolean;
};

const ROUTE_SEO: Record<string, RouteSeo> = {
  "/": {
    title: "DEVPULSE | Real-Time API Monitoring & AgentGuard Security",
    description:
      "Monitor API health in real time, discover compatibility, generate integration code, and secure AI agents with AgentGuard.",
  },
  "/agentguard": {
    title: "AgentGuard | AI Agent Security & Cost Control",
    description:
      "Protect AI agents with loop detection, leak scanning, budget guardrails, webhook alerts, and usage analytics.",
  },
  "/agentguard/landing": {
    title: "AgentGuard | AI Agent Security Platform",
    description:
      "Enterprise-grade controls for AI agent security, spend management, team governance, and incident response.",
  },
  "/agentguard/docs": {
    title: "AgentGuard SDK Docs | DEVPULSE",
    description:
      "Read AgentGuard SDK documentation to integrate monitoring, security checks, and policy controls into your AI workflows.",
  },
  "/pricing": {
    title: "Pricing | DEVPULSE",
    description:
      "Choose a DEVPULSE plan for real-time API intelligence and AgentGuard security capabilities.",
  },
  "/privacy": {
    title: "Privacy Policy | DEVPULSE",
    description: "Read the DEVPULSE privacy policy, data practices, and user rights.",
  },
  "/terms": {
    title: "Terms of Service | DEVPULSE",
    description: "Read the DEVPULSE terms of service and platform usage conditions.",
  },
  "/refund": {
    title: "Refund Policy | DEVPULSE",
    description: "Review DEVPULSE refund policy, conditions, and billing support details.",
  },
  "/contact": {
    title: "Contact | DEVPULSE",
    description: "Contact DEVPULSE support, billing, and sales teams.",
  },
  "/api-monitoring-tool": {
    title: "API Monitoring Tool | DEVPULSE",
    description:
      "Track API uptime, latency, and reliability in real time with DEVPULSE API monitoring for developers.",
  },
  "/ai-agent-security-platform": {
    title: "AI Agent Security Platform | AgentGuard by DEVPULSE",
    description:
      "Secure and govern AI agents with AgentGuard: runtime safeguards, cost controls, alerts, and audit visibility.",
  },
  "/api-monitoring-alternatives": {
    title: "API Monitoring Alternatives | DEVPULSE Comparison",
    description:
      "Compare API monitoring alternatives and see where DEVPULSE fits for modern developer and AI-agent operations.",
  },
  "/auth": {
    title: "Sign In | DEVPULSE",
    description: "Sign in to DEVPULSE to access AgentGuard and your account.",
    noindex: true,
  },
  "/auth/reset-password": {
    title: "Reset Password | DEVPULSE",
    description: "Reset your DEVPULSE account password securely.",
    noindex: true,
  },
  "/agentguard/reset-password": {
    title: "Reset Password | DEVPULSE",
    description: "Reset your DEVPULSE account password securely.",
    noindex: true,
  },
};

function upsertMetaByName(name: string, content: string) {
  let tag = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
  let tag = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function upsertJsonLd(id: string, data: unknown) {
  let tag = document.head.querySelector(`script[data-seo-jsonld="${id}"]`) as HTMLScriptElement | null;
  if (!tag) {
    tag = document.createElement("script");
    tag.setAttribute("type", "application/ld+json");
    tag.setAttribute("data-seo-jsonld", id);
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

function removeJsonLd(id: string) {
  const tag = document.head.querySelector(`script[data-seo-jsonld="${id}"]`);
  if (tag) tag.remove();
}

export default function SeoMeta() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const fallback: RouteSeo = {
      title: "DEVPULSE | Real-Time API Intelligence",
      description:
        "DEVPULSE provides real-time API monitoring, compatibility insights, and AgentGuard security for AI agents.",
    };
    const seo = ROUTE_SEO[path] || fallback;
    const canonicalUrl = `${SITE_URL}${path}`;
    const robots = seo.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large";

    document.title = seo.title;
    upsertMetaByName("description", seo.description);
    upsertMetaByName("robots", robots);
    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
    upsertMetaByName("twitter:image", DEFAULT_IMAGE);
    upsertMetaByName("twitter:card", "summary_large_image");

    upsertMetaByProperty("og:title", seo.title);
    upsertMetaByProperty("og:description", seo.description);
    upsertMetaByProperty("og:type", "website");
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:image", DEFAULT_IMAGE);
    upsertMetaByProperty("og:site_name", "DEVPULSE");

    upsertCanonical(canonicalUrl);

    if (path === "/") {
      upsertJsonLd("software", {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "DEVPULSE",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description: seo.description,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      });

      upsertJsonLd("faq", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is DEVPULSE used for?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "DEVPULSE is used for real-time API monitoring, compatibility discovery, and integration acceleration.",
            },
          },
          {
            "@type": "Question",
            name: "Does DEVPULSE show live data?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. DEVPULSE probes API endpoints at runtime and reports live status and latency trends.",
            },
          },
          {
            "@type": "Question",
            name: "What is AgentGuard?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "AgentGuard is DEVPULSE security and cost control for AI agents, including monitoring and guardrails.",
            },
          },
        ],
      });
    } else {
      removeJsonLd("software");
      removeJsonLd("faq");
    }
  }, [location.pathname]);

  return null;
}

