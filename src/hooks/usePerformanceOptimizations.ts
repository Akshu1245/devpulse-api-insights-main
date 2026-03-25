import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Service Worker Registration Hook
 * Registers SW for offline support and instant caching
 */
export function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Register immediately (not on load event) for faster activation
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Immediately activate new SW without waiting for page reload
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  newWorker.postMessage({ type: "SKIP_WAITING" });
                }
              });
            }
          });
        })
        .catch(() => {
          // SW registration failed silently - app still works
        });
    }
  }, []);
}

/**
 * Route Preload Hook
 * Preloads critical chunks for routes on hover/visibility
 * Uses requestIdleCallback for non-blocking preloading
 * NOTE: Must be called inside a BrowserRouter context
 */
export function useRoutePreload() {
  const location = useLocation();
  const preloadedRef = useRef(new Set<string>());

  useEffect(() => {
    // Preload next likely routes based on current location
    const routePreloadMap: Record<string, Array<() => Promise<unknown>>> = {
      "/": [
        () => import("../pages/AgentGuardGate"),
        () => import("../pages/Auth"),
      ],
      "/agentguard": [
        () => import("../pages/AgentGuardDashboard"),
        () => import("../pages/AgentGuardSettings"),
      ],
      "/auth": [
        () => import("../pages/AgentGuardDashboard"),
      ],
    };

    const preloadFns = routePreloadMap[location.pathname];
    if (!preloadFns || preloadedRef.current.has(location.pathname)) return;

    preloadedRef.current.add(location.pathname);

    // Use requestIdleCallback to preload without blocking main thread
    const schedulePreload = () => {
      preloadFns.forEach(fn => {
        try { fn(); } catch { /* ignore */ }
      });
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(schedulePreload, { timeout: 2000 });
    } else {
      setTimeout(schedulePreload, 500);
    }
  }, [location.pathname]);
}

/**
 * Image Lazy Load Hook
 * Intersection Observer for lazy loading images
 */
export function useLazyLoadImages() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;

    const imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute("data-src");
              imageObserver.unobserve(img);
            }
          }
        });
      },
      {
        // Start loading 200px before entering viewport
        rootMargin: "200px",
        threshold: 0,
      }
    );

    document.querySelectorAll("img[data-src]").forEach((img) => {
      imageObserver.observe(img);
    });

    return () => imageObserver.disconnect();
  }, []);
}

/**
 * Interaction Responsiveness Hook
 * Ensures all interactions feel instant by pre-warming GPU layers
 */
export function useInteractionOptimizations() {
  useEffect(() => {
    // Pre-warm GPU compositing layer for smooth animations
    const style = document.createElement("style");
    style.textContent = `
      /* Promote frequently animated elements to GPU layers */
      .framer-motion-element,
      [data-framer-component-type],
      [style*="transform"],
      [style*="opacity"] {
        will-change: auto;
      }
    `;
    document.head.appendChild(style);

    // Prevent 300ms tap delay on all touch devices
    document.documentElement.style.touchAction = "manipulation";

    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

/**
 * Combined Performance Hook
 * Must be called inside a BrowserRouter context (useRoutePreload uses useLocation)
 */
export function usePerformanceOptimizations() {
  useServiceWorker();
  useRoutePreload();
  useLazyLoadImages();
  useInteractionOptimizations();
}
