"""
Agent Guard Backend API Endpoints
Handles AI agent monitoring, cost tracking, and security
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal
import uuid

from services.supabase_client import supabase
from services.auth_guard import get_current_user_id

router = APIRouter(prefix="/agentguard", tags=["agentguard"])

# ============= Pydantic Models =============

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    ai_model: str
    api_endpoint: Optional[str] = None
    budget_limit: Optional[Decimal] = None
    budget_period: str = "monthly"

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    budget_limit: Optional[Decimal] = None

class AgentResponse(BaseModel):
    id: str
    user_id: str
    name: str
    status: str
    ai_model: str
    budget_limit: Optional[Decimal]
    created_at: str

class CostEntry(BaseModel):
    model_name: str
    input_tokens: int
    output_tokens: int
    cost: Decimal

class AlertResponse(BaseModel):
    id: str
    agent_id: str
    alert_type: str
    severity: str
    title: str
    message: Optional[str]
    status: str
    created_at: str

# ============= Agents Endpoints =============

@router.post("/agents", response_model=AgentResponse)
async def create_agent(agent: AgentCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new AI agent"""
    try:
        agent_id = str(uuid.uuid4())
        response = supabase.table("agents").insert({
            "id": agent_id,
            "user_id": user_id,
            "name": agent.name,
            "description": agent.description,
            "ai_model": agent.ai_model,
            "api_endpoint": agent.api_endpoint,
            "budget_limit": float(agent.budget_limit) if agent.budget_limit else None,
            "budget_period": agent.budget_period
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create agent")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating agent: {str(e)}")

@router.get("/agents", response_model=List[AgentResponse])
async def list_agents(user_id: str = Depends(get_current_user_id)):
    """List all agents for current user"""
    try:
        response = supabase.table("agents")\
            .select("*")\
            .eq("user_id", user_id)\
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching agents: {str(e)}")

@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, user_id: str = Depends(get_current_user_id)):
    """Get specific agent details"""
    try:
        response = supabase.table("agents")\
            .select("*")\
            .eq("id", agent_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching agent: {str(e)}")

@router.put("/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, agent: AgentUpdate, user_id: str = Depends(get_current_user_id)):
    """Update agent details"""
    try:
        # Verify ownership
        existing = supabase.table("agents")\
            .select("user_id")\
            .eq("id", agent_id)\
            .single()\
            .execute()
        
        if not existing.data or existing.data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        update_data = agent.dict(exclude_unset=True)
        if "budget_limit" in update_data and update_data["budget_limit"]:
            update_data["budget_limit"] = float(update_data["budget_limit"])
        
        response = supabase.table("agents")\
            .update(update_data)\
            .eq("id", agent_id)\
            .execute()
        
        return response.data[0] if response.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating agent: {str(e)}")

@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete an agent"""
    try:
        # Verify ownership
        existing = supabase.table("agents")\
            .select("user_id")\
            .eq("id", agent_id)\
            .single()\
            .execute()
        
        if not existing.data or existing.data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        supabase.table("agents").delete().eq("id", agent_id).execute()
        return {"message": "Agent deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting agent: {str(e)}")

# ============= Costs Endpoints =============

@router.post("/agents/{agent_id}/costs")
async def log_cost(agent_id: str, cost: CostEntry, user_id: str = Depends(get_current_user_id)):
    """Log API usage cost for an agent"""
    try:
        # Verify agents exists and user owns it
        agent = supabase.table("agents")\
            .select("user_id, budget_limit")\
            .eq("id", agent_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not agent.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        # Add cost entry
        response = supabase.table("agent_costs").insert({
            "agent_id": agent_id,
            "model_name": cost.model_name,
            "input_tokens": cost.input_tokens,
            "output_tokens": cost.output_tokens,
            "cost": float(cost.cost)
        }).execute()
        
        # Check budget
        if agent.data.get("budget_limit"):
            month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0)
            total_costs = supabase.table("agent_costs")\
                .select("cost")\
                .eq("agent_id", agent_id)\
                .gte("timestamp", month_start.isoformat())\
                .execute()
            
            total = sum(c["cost"] for c in total_costs.data if c["cost"])
            if total > agent.data["budget_limit"]:
                # Create alert
                supabase.table("agent_alerts").insert({
                    "agent_id": agent_id,
                    "user_id": user_id,
                    "alert_type": "budget_exceeded",
                    "severity": "critical",
                    "title": "Budget Exceeded",
                    "message": f"Agent exceeded budget: ${total:.2f} / ${agent.data['budget_limit']:.2f}"
                }).execute()
        
        return response.data[0] if response.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error logging cost: {str(e)}")

@router.get("/agents/{agent_id}/costs")
async def get_agent_costs(
    agent_id: str,
    days: int = Query(30, ge=1, le=365),
    user_id: str = Depends(get_current_user_id)
):
    """Get cost history for an agent"""
    try:
        # Verify ownership
        agent = supabase.table("agents")\
            .select("user_id")\
            .eq("id", agent_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not agent.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        start_date = (datetime.now() - timedelta(days=days)).isoformat()
        response = supabase.table("agent_costs")\
            .select("*")\
            .eq("agent_id", agent_id)\
            .gte("timestamp", start_date)\
            .order("timestamp", desc=True)\
            .execute()
        
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching costs: {str(e)}")

@router.get("/agents/{agent_id}/costs/summary")
async def get_cost_summary(agent_id: str, user_id: str = Depends(get_current_user_id)):
    """Get summarized cost metrics"""
    try:
        # Verify ownership
        agent = supabase.table("agents")\
            .select("user_id")\
            .eq("id", agent_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not agent.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        # Get costs from last 30 days
        start_date = (datetime.now() - timedelta(days=30)).isoformat()
        costs = supabase.table("agent_costs")\
            .select("*")\
            .eq("agent_id", agent_id)\
            .gte("timestamp", start_date)\
            .execute()
        
        total_cost = sum(c.get("cost", 0) for c in costs.data if c.get("cost"))
        total_input = sum(c.get("input_tokens", 0) for c in costs.data if c.get("input_tokens"))
        total_output = sum(c.get("output_tokens", 0) for c in costs.data if c.get("output_tokens"))
        
        return {
            "total_cost": round(total_cost, 4),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "avg_cost_per_call": round(total_cost / len(costs.data), 4) if costs.data else 0,
            "period": "30_days"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating summary: {str(e)}")

# ============= Alerts Endpoints =============

@router.get("/alerts", response_model=List[AlertResponse])
async def get_alerts(
    status: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id)
):
    """Get all alerts for user"""
    try:
        query = supabase.table("agent_alerts")\
            .select("*")\
            .eq("user_id", user_id)
        
        if status:
            query = query.eq("status", status)
        
        response = query.order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching alerts: {str(e)}")

@router.put("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, user_id: str = Depends(get_current_user_id)):
    """Mark alert as resolved"""
    try:
        # Verify ownership
        alert = supabase.table("agent_alerts")\
            .select("user_id")\
            .eq("id", alert_id)\
            .single()\
            .execute()
        
        if not alert.data or alert.data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        response = supabase.table("agent_alerts")\
            .update({
                "status": "resolved",
                "resolved_at": datetime.now().isoformat()
            })\
            .eq("id", alert_id)\
            .execute()
        
        return response.data[0] if response.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resolving alert: {str(e)}")

# ============= Audit Log Endpoints =============

@router.get("/audit/{agent_id}")
async def get_audit_log(
    agent_id: str,
    action: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id)
):
    """Get audit log for an agent"""
    try:
        # Verify ownership
        agent = supabase.table("agents")\
            .select("user_id")\
            .eq("id", agent_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not agent.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        query = supabase.table("agent_audit_log")\
            .select("*")\
            .eq("agent_id", agent_id)
        
        if action:
            query = query.eq("action", action)
        
        response = query.order("timestamp", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching audit log: {str(e)}")

# ============= Health & Stats Endpoints =============

@router.get("/stats")
async def get_user_stats(user_id: str = Depends(get_current_user_id)):
    """Get aggregate statistics for user"""
    try:
        # Get agent count
        agents = supabase.table("agents")\
            .select("id")\
            .eq("user_id", user_id)\
            .execute()
        
        # Get active alerts
        alerts = supabase.table("agent_alerts")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .execute()
        
        # Get total costs (last 30 days)
        start_date = (datetime.now() - timedelta(days=30)).isoformat()
        costs = supabase.table("agent_costs")\
            .select("cost")\
            .gte("timestamp", start_date)\
            .execute()
        
        total_cost = sum(c.get("cost", 0) for c in costs.data if c.get("cost"))
        
        return {
            "total_agents": len(agents.data),
            "active_alerts": len(alerts.data),
            "total_cost_30d": round(total_cost, 2),
            "agents_by_status": {
                "active": len([a for a in agents.data]),
                "inactive": 0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {str(e)}")
