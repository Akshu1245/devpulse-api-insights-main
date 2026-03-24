import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches task count for the current month (Free tier limit: 100 tasks/month).
 * A "task" is a distinct task_id from agent_logs, or one per log when task_id is null.
 */
export function useTasksThisMonth(userId: string | undefined) {
  const [tasksThisMonth, setTasksThisMonth] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const fetchTasks = async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data } = await supabase
        .from("agent_logs")
        .select("id, task_id")
        .eq("user_id", userId)
        .gte("created_at", startOfMonth);

      if (!data) {
        setLoading(false);
        return;
      }

      // Count distinct tasks: use task_id when present, else treat each row as a task
      const seen = new Set<string>();
      data.forEach((log) => {
        const key = log.task_id || log.id;
        seen.add(key);
      });
      setTasksThisMonth(seen.size);
      setLoading(false);
    };
    fetchTasks();
  }, [userId]);

  return { tasksThisMonth, loading };
}
