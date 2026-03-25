# ⚡ DevPulse API Insights - Performance First Development Guide

## 🎯 MANDATORY PERFORMANCE REQUIREMENTS

**THIS IS A LIGHTNING-FAST APPLICATION.** All new features and code MUST maintain or improve performance. No exceptions.

### Core Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **LCP** (Largest Contentful Paint) | < 1.5s | > 2.5s = FAIL |
| **FID** (First Input Delay) | < 100ms | > 300ms = FAIL |
| **CLS** (Cumulative Layout Shift) | < 0.1 | > 0.25 = FAIL |
| **TTFB** (Time to First Byte) | < 200ms | > 600ms = FAIL |
| **Bundle Size (Initial)** | < 100KB gzipped | > 200KB = FAIL |
| **Total Bundle Size** | < 500KB gzipped | > 1MB = FAIL |

---

## 🚀 PERFORMANCE ARCHITECTURE

### 1. Code Splitting (ALWAYS REQUIRED)

**EVERY new page/route MUST be lazy loaded:**

```typescript
// ✅ CORRECT - Lazy load all pages
const NewFeature = lazy(() => import("./pages/NewFeature"));

// ❌ WRONG - Never import pages directly
import NewFeature from "./pages/NewFeature"; // NEVER DO THIS
```

**App.tsx Pattern:**
```typescript
// All routes inside Suspense with PageLoader fallback
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/new-feature" element={<NewFeature />} />
  </Routes>
</Suspense>
```

### 2. Data Fetching (React Query ONLY)

**NEVER use useEffect + fetch pattern. ALWAYS use React Query:**

```typescript
// ✅ CORRECT - Use React Query hooks
import { useQuery, useMutation } from "@tanstack/react-query";

function MyComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["myData", userId],
    queryFn: () => api.getMyData(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ❌ WRONG - Manual fetching
useEffect(() => {
  fetch("/api/data").then(...); // NEVER DO THIS
}, []);
```

**Create hooks in `src/lib/apiHooks.ts` or `src/lib/supabaseHooks.ts`:**

```typescript
// Add new hooks for your API endpoints
export function useNewFeature(userId: string) {
  return useQuery({
    queryKey: ["newFeature", userId],
    queryFn: () => api.getNewFeature(userId),
    staleTime: 60 * 1000, // 1 minute
  });
}
```

### 3. Bundle Optimization

**Vite config already has manual chunks. Follow these rules:**

- **Imports matter:** Only import what you use
- **Icons:** Import specific icons, not entire sets
- **Large libs:** Always code-split heavy dependencies

```typescript
// ✅ CORRECT - Specific imports
import { Shield, AlertTriangle } from "lucide-react";

// ❌ WRONG - Importing everything
import * as Icons from "lucide-react"; // BUNDLE BLOAT!
```

### 4. Component Optimization

**Use React.memo() for expensive components:**

```typescript
// ✅ CORRECT - Memoize expensive components
const ExpensiveChart = memo(function ExpensiveChart({ data }) {
  return <Chart data={data} />;
});

// Use useCallback for stable function references
const handleClick = useCallback(() => {
  // handler logic
}, [dependencies]);
```

**Avoid inline objects in JSX:**

```typescript
// ✅ CORRECT - Stable reference
const style = useMemo(() => ({ color: "red" }), []);
<div style={style} />

// ❌ WRONG - New object every render
<div style={{ color: "red" }} /> // Causes re-renders!
```

### 5. Service Worker (Offline-First)

**The app has offline support via service worker. Rules:**

- API calls use "network first, cache fallback"
- Static assets use "cache first, network update"
- Offline page at `/offline.html`

**DO NOT modify `public/sw.js` unless you understand caching strategies.**

---

## 📦 NEW FEATURE CHECKLIST

Before submitting ANY new feature, verify:

### Code Quality
- [ ] All new pages are lazy-loaded with `lazy()`
- [ ] All data fetching uses React Query hooks
- [ ] No console.log() in production code
- [ ] No unused imports or dependencies
- [ ] TypeScript types are properly defined

### Performance
- [ ] LCP < 1.5s (test with Chrome DevTools)
- [ ] Bundle size increase < 20KB
- [ ] No new waterfall requests
- [ ] Images use lazy loading (`loading="lazy"`)
- [ ] Large lists use virtualization

### Caching
- [ ] API responses have appropriate `staleTime`
- [ ] Static data uses `gcTime: 5 * 60 * 1000`
- [ ] Mutations invalidate correct queries

### Testing
- [ ] Test on slow 3G network (DevTools throttling)
- [ ] Test offline mode
- [ ] Test with React DevTools Profiler

---

## 🔧 PERFORMANCE TOOLS

### Required Browser Extensions
1. **React DevTools** - Component profiling
2. **Lighthouse** - Performance auditing
3. **Web Vitals** - Real-time metrics

### DevTools Commands

**Check bundle size:**
```bash
bun run build
# Analyze dist/assets/ folder
```

**Profile component renders:**
```typescript
// In component
import { whyDidYouRender } from "@welldone-software/why-did-you-render";
```

**Measure LCP/FID/CLS:**
```javascript
// In browser console
performance.getEntriesByType("paint")
performance.getEntriesByType("largest-contentful-paint")
```

---

## 🎨 UI COMPONENT GUIDELINES

### When Creating New Components

1. **Use existing shadcn/ui components** - Don't reinvent
2. **Lazy load heavy UI** (charts, maps, 3D):
   ```typescript
   const HeavyChart = lazy(() => import("./HeavyChart"));
   ```
3. **Skeleton loaders** for all async content
4. **Error boundaries** around risky components

### Animation Performance

```typescript
// ✅ CORRECT - Use CSS transforms
<motion.div animate={{ x: 100, rotate: 45 }} />

// ❌ WRONG - Layout-triggering animations
<motion.div animate={{ width: 200, margin: 20 }} /> // Causes reflow!
```

**Framer Motion rules:**
- Use `will-change` sparingly
- Prefer `transform` and `opacity`
- Set `viewport={{ once: true }}` for scroll animations

---

## 📊 MONITORING

### Performance Monitoring is Automatic

The `PerformanceMonitor` component tracks:
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)
- Slow resources (> 1s)

**Logs appear in console (production only).**

### When Performance Regresses

1. **Check Chrome DevTools > Performance tab**
2. **Run Lighthouse audit**
3. **Check bundle analyzer:**
   ```bash
   bun run build
   # Check dist/assets/ sizes
   ```
4. **Profile with React DevTools**

---

## 🚫 COMMON PERFORMANCE MISTAKES

### NEVER DO THESE:

```typescript
// ❌ 1. useEffect with fetch
useEffect(() => {
  fetch("/api/data").then(...);
}, []);

// ✅ USE: useQuery from React Query

// ❌ 2. Inline styles with objects
<div style={{ marginTop: 10 }} />

// ✅ USE: Tailwind classes
<div className="mt-2" />

// ❌ 3. Unmemoized callbacks
const handleClick = () => { ... };

// ✅ USE: useCallback
const handleClick = useCallback(() => { ... }, [deps]);

// ❌ 4. Importing entire icon libraries
import * as Icons from "lucide-react";

// ✅ USE: Specific imports
import { Shield } from "lucide-react";

// ❌ 5. Synchronous operations on main thread
const result = data.map(expensiveComputation);

// ✅ USE: Web Worker or useMemo
const result = useMemo(() => data.map(expensiveComputation), [data]);

// ❌ 6. Large state objects
const [state, setState] = useState({ a: 1, b: 2, c: 3, ... });

// ✅ USE: Multiple states or Zustand
const [a, setA] = useState(1);
const [b, setB] = useState(2);
```

---

## 🏗️ ARCHITECTURE DECISIONS

### State Management Hierarchy

1. **Server state** → React Query (ALWAYS)
2. **Global client state** → Zustand
3. **Local state** → useState/useReducer
4. **URL state** → React Router search params

### File Organization

```
src/
├── lib/
│   ├── apiHooks.ts       # React Query hooks for API
│   └── supabaseHooks.ts  # React Query hooks for Supabase
├── hooks/
│   └── use*.ts           # Reusable React hooks
├── components/
│   ├── ui/               # shadcn/ui components (DO NOT MODIFY)
│   └── *.tsx             # Feature components
└── pages/
    └── *.tsx             # Route components (ALWAYS lazy-loaded)
```

---

## 📝 CODE REVIEW PERFORMANCE QUESTIONS

Before merging ANY PR, answer:

1. **Does this increase bundle size?** By how much?
2. **Are there new waterfall requests?**
3. **Is data caching configured correctly?**
4. **Will this cause unnecessary re-renders?**
5. **Does it work offline?**
6. **Have you tested on slow networks?**

---

## 🎯 PERFORMANCE MANTRAS

> **"Fast by default, faster by design."**

> **"Cache everything, trust nothing."**

> **"Lazy load or go home."**

> **"Measure twice, optimize once."**

> **"The fastest code is the code you don't run."**

---

## 🔥 ULTIMATE RULE

**If it makes the app slower, DON'T DO IT.**

No feature is worth sacrificing performance. Find a faster way or don't build it.

**Questions?** Check existing code patterns in:
- `src/components/devpulse/OverviewCards.tsx` - React Query pattern
- `src/App.tsx` - Code splitting pattern
- `src/lib/apiHooks.ts` - Hook creation pattern
- `src/components/HealthDashboard.tsx` - Optimization pattern

---

**REMEMBER:** Users leave if your app is slow. Performance is a feature. 🚀
