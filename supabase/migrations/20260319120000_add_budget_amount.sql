-- Pre-paid budget per agent: pause when total_cost >= budget_amount
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN public.agents.budget_amount IS 'Optional pre-paid budget. Agent should pause when total_cost >= budget_amount.';
