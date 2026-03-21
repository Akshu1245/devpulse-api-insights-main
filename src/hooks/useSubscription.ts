import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const TIERS = {
  free: {
    name: "Free",
    price: "$0",
    agents: 1,
    tasks_per_month: 100,
  },
  pro: {
    price_id: "price_1T8lW8IJZyuGgRb844xhVrFp",
    product_id: "prod_U6zVphW5YLjDsy",
    name: "Pro",
    price: "$12/mo",
    agents: 10,
    tasks_per_month: null, // unlimited
  },
  team: {
    price_id: "price_1T8lePIJZyuGgRb8pe7BLhha",
    product_id: "prod_U6zdqQ17IiWgPu",
    name: "Team",
    price: "$39/mo",
    agents: 50,
    tasks_per_month: null, // unlimited
  },
} as const;

export type TierKey = keyof typeof TIERS | "free";

export function useSubscription() {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [tier, setTier] = useState<TierKey>("free");
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setSubscribed(data.subscribed);
      setSubscriptionEnd(data.subscription_end);

      if (data.product_id) {
        const found = Object.entries(TIERS).find(([, t]) => t.product_id === data.product_id);
        setTier(found ? (found[0] as TierKey) : "free");
      } else {
        setTier("free");
      }
    } catch (err) {
      console.error("Subscription check failed:", err);
      setSubscribed(false);
      setTier("free");
      setSubscriptionEnd(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkSubscription();
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [checkSubscription]);

  const checkout = async (tierKey: "pro" | "team") => {
    const priceId = TIERS[tierKey].price_id;
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId },
    });
    if (error) throw error;
    if (data?.url) window.open(data.url, "_blank");
  };

  const manageSubscription = async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");
    if (error) throw error;
    if (data?.url) window.open(data.url, "_blank");
  };

  return {
    subscribed,
    tier,
    subscriptionEnd,
    loading,
    checkout,
    manageSubscription,
    refresh: checkSubscription,
    TIERS,
  };
}
