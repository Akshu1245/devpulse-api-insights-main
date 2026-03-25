import { create } from "zustand";
import type { APIHealthMetrics } from "@/data/apiData";

interface HealthStore {
  metrics: APIHealthMetrics[];
  probeCount: number;
  isProbing: boolean;
  lastProbeTime: number;
  setMetrics: (m: APIHealthMetrics[]) => void;
  setProbeCount: (n: number) => void;
  setIsProbing: (b: boolean) => void;
}

const CACHE_DURATION = 5000;

export const useHealthStore = create<HealthStore>((set, get) => ({
  metrics: [],
  probeCount: 0,
  isProbing: false,
  lastProbeTime: 0,
  setMetrics: (metrics) => set({ metrics, lastProbeTime: Date.now() }),
  setProbeCount: (probeCount) => set({ probeCount }),
  setIsProbing: (isProbing) => set({ isProbing }),
}));

export function shouldSkipProbe(): boolean {
  const { isProbing, lastProbeTime } = useHealthStore.getState();
  const now = Date.now();
  return isProbing || (now - lastProbeTime < CACHE_DURATION);
}
