import { useEffect } from "react";

/**
 * Performance Monitoring Component
 * Tracks Core Web Vitals and logs performance metrics
 */
export default function PerformanceMonitor() {
  useEffect(() => {
    // Only monitor in production
    if (import.meta.env.MODE !== "production") return;

    // Track Largest Contentful Paint (LCP)
    const reportLCP = () => {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        const lcp = lastEntry.renderTime || lastEntry.loadTime;
        
        console.log("[Performance] LCP:", lcp.toFixed(2), "ms");
        
        // Send to analytics (replace with your analytics service)
        // analytics.track("LCP", { value: lcp });
      }).observe({ type: "largest-contentful-paint", buffered: true });
    };

    // Track First Input Delay (FID)
    const reportFID = () => {
      new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          const fid = entry.processingStart - entry.startTime;
          console.log("[Performance] FID:", fid.toFixed(2), "ms");
          // analytics.track("FID", { value: fid });
        });
      }).observe({ type: "first-input", buffered: true });
    };

    // Track Cumulative Layout Shift (CLS)
    const reportCLS = () => {
      let clsValue = 0;
      new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            console.log("[Performance] CLS:", clsValue.toFixed(4));
            // analytics.track("CLS", { value: clsValue });
          }
        });
      }).observe({ type: "layout-shift", buffered: true });
    };

    // Track Time to First Byte (TTFB)
    const reportTTFB = () => {
      const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      if (navigationEntry) {
        const ttfb = navigationEntry.responseStart - navigationEntry.startTime;
        console.log("[Performance] TTFB:", ttfb.toFixed(2), "ms");
        // analytics.track("TTFB", { value: ttfb });
      }
    };

    // Track Resource Loading
    const reportResources = () => {
      const resources = performance.getEntriesByType("resource");
      const slowResources = resources.filter(
        (r) => r.duration > 1000
      );
      
      if (slowResources.length > 0) {
        console.warn("[Performance] Slow resources detected:", slowResources.map((r) => ({
          name: r.name,
          duration: r.duration.toFixed(2),
          type: (r as PerformanceResourceTiming).initiatorType,
        })));
      }
    };

    // Initialize observers
    reportLCP();
    reportFID();
    reportCLS();
    reportTTFB();
    
    // Report resources after page load
    setTimeout(reportResources, 5000);

    // Report overall page load time
    window.addEventListener("load", () => {
      const loadTime = performance.now();
      console.log("[Performance] Page Load Time:", loadTime.toFixed(2), "ms");
      // analytics.track("PAGE_LOAD", { value: loadTime });
    });
  }, []);

  return null;
}
