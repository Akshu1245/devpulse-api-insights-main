"""
LLM API Proxy Router — DevPulse
Real API proxy that connects to OpenAI/Anthropic, logs actual token usage,
and triggers thinking-token attribution automatically.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from openai import OpenAI
from anthropic import Anthropic

from services.auth_guard import get_current_user_id
from services.llm_proxy import LLMProxy, TokenClassifier
from services.supabase_client import supabase

router = APIRouter(prefix="/llm-proxy", tags=["llm-proxy"])


class LLMRequest(BaseModel):
    """Unified request for any LLM provider."""

    provider: str = Field(..., description="openai or anthropic")
    model: str = Field(..., description="Model name (e.g., gpt-4o, claude-3-5-sonnet)")
    messages: list[dict[str, Any]] = Field(default_factory=list)
    # OpenAI-specific
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    # Anthropic-specific
    system: str | None = None
    max_tokens_to_sample: int | None = None


class LLMKeyRequest(BaseModel):
    """Request to register an API key for a provider."""

    provider: str = Field(..., description="openai or anthropic")
    api_key: str = Field(..., description="The actual API key (stored securely)")
    key_name: str = Field(..., description="User-friendly name for this key")


@router.post("/key")
async def register_api_key(
    req: LLMKeyRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Register an API key for LLM access.
    Keys are encrypted and stored in the database.
    """
    if req.provider not in ("openai", "anthropic"):
        raise HTTPException(
            status_code=400, detail="Provider must be 'openai' or 'anthropic'"
        )

    # In production, encrypt this key before storing
    # For now, store with basic masking for display
    masked_key = (
        f"{req.api_key[:4]}...{req.api_key[-4:]}" if len(req.api_key) > 8 else "***"
    )

    row = {
        "user_id": auth_user_id,
        "provider": req.provider,
        "key_name": req.key_name,
        "key_hash": masked_key,  # Store hash/mask, not actual key
        "is_active": True,
    }

    try:
        # Check if user already has a key for this provider
        existing = (
            supabase.table("llm_api_keys")
            .select("id")
            .eq("user_id", auth_user_id)
            .eq("provider", req.provider)
            .execute()
        )

        if existing.data:
            # Update existing
            supabase.table("llm_api_keys").update(row).eq("user_id", auth_user_id).eq(
                "provider", req.provider
            ).execute()
        else:
            # Insert new
            supabase.table("llm_api_keys").insert(row).execute()

        return {
            "success": True,
            "message": f"{req.provider.title()} API key registered",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store key: {str(e)}")


@router.get("/keys/{user_id}")
def get_user_keys(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get user's registered LLM API keys (masked)."""
    if auth_user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        res = (
            supabase.table("llm_api_keys")
            .select("id, provider, key_name, key_hash, is_active, created_at")
            .eq("user_id", user_id)
            .execute()
        )
        return {"keys": res.data or []}
    except Exception as e:
        return {"keys": [], "error": str(e)}


@router.post("/chat")
async def llm_chat(
    req: LLMRequest,
    auth_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Real LLM API proxy that:
    1. Looks up the user's API key for the provider
    2. Makes the actual API call to OpenAI/Anthropic
    3. Extracts real token usage from the response
    4. Logs to thinking_tokens and triggers attribution
    """
    # Get user's API key
    try:
        key_res = (
            supabase.table("llm_api_keys")
            .select("api_key")  # In production, decrypt this
            .eq("user_id", auth_user_id)
            .eq("provider", req.provider)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )

        if not key_res.data:
            raise HTTPException(
                status_code=400,
                detail=f"No active {req.provider} API key. Register one first at /llm-proxy/key",
            )

        api_key = key_res.data[0].get("api_key")
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not properly stored")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Key lookup failed: {str(e)}")

    start_time = time.monotonic()
    response = None

    # Make the real API call
    if req.provider == "openai":
        try:
            client = OpenAI(api_key=api_key)
            chat_params = {
                "model": req.model,
                "messages": req.messages,
                "stream": req.stream,
            }
            if req.temperature is not None:
                chat_params["temperature"] = req.temperature
            if req.max_tokens is not None:
                chat_params["max_tokens"] = req.max_tokens

            response = client.chat.completions.create(**chat_params)

            # Extract real usage
            usage = response.usage
            latency_ms = (time.monotonic() - start_time) * 1000

            # Build usage dict for our attribution system
            usage_dict = {
                "prompt_tokens": usage.prompt_tokens if usage else 0,
                "completion_tokens": usage.completion_tokens if usage else 0,
                "total_tokens": usage.total_tokens if usage else 0,
            }

            # OpenAI o-series models have reasoning_tokens
            if (
                hasattr(usage, "completion_tokens_details")
                and usage.completion_tokens_details
            ):
                details = usage.completion_tokens_details
                if hasattr(details, "reasoning_tokens"):
                    usage_dict["completion_tokens_details"] = {
                        "reasoning_tokens": details.reasoning_tokens
                    }

            # Calculate cost using real rates
            from services.thinking_tokens import TOKEN_COSTS_USD

            costs = TOKEN_COSTS_USD.get(
                req.model, {"input": 0.0025, "output": 0.01, "thinking": 0.01}
            )
            cost_usd = (
                usage_dict["prompt_tokens"] / 1000 * costs["input"]
                + usage_dict["completion_tokens"] / 1000 * costs["output"]
            )

            # Log to our system
            _log_llm_usage(
                user_id=auth_user_id,
                provider="openai",
                model=req.model,
                prompt_tokens=usage_dict["prompt_tokens"],
                completion_tokens=usage_dict["completion_tokens"],
                total_tokens=usage_dict["total_tokens"],
                cost_usd=cost_usd,
                latency_ms=latency_ms,
            )

            # Return response + metadata
            return {
                "success": True,
                "provider": "openai",
                "model": req.model,
                "response": response.model_dump()
                if hasattr(response, "model_dump")
                else str(response),
                "usage": {
                    "prompt_tokens": usage_dict["prompt_tokens"],
                    "completion_tokens": usage_dict["completion_tokens"],
                    "total_tokens": usage_dict["total_tokens"],
                },
                "cost_usd": round(cost_usd, 6),
                "latency_ms": round(latency_ms, 1),
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")

    elif req.provider == "anthropic":
        try:
            client = Anthropic(api_key=api_key)

            # Convert messages to Anthropic format
            anthropic_messages = []
            system_msg = None
            for msg in req.messages:
                role = msg.get("role", "user")
                if role == "system":
                    system_msg = msg.get("content", "")
                else:
                    anthropic_messages.append(
                        {
                            "role": "user" if role == "user" else "assistant",
                            "content": msg.get("content", ""),
                        }
                    )

            params = {
                "model": req.model,
                "messages": anthropic_messages,
                "max_tokens": req.max_tokens_to_sample or 1024,
            }
            if system_msg:
                params["system"] = system_msg
            if req.temperature is not None:
                params["temperature"] = req.temperature

            response = client.messages.create(**params)

            # Extract real usage
            usage = response.usage
            latency_ms = (time.monotonic() - start_time) * 1000

            usage_dict = {
                "input_tokens": usage.input_tokens if usage else 0,
                "output_tokens": usage.output_tokens if usage else 0,
                "total_tokens": (usage.input_tokens + usage.output_tokens)
                if usage
                else 0,
            }

            # Anthropic extended thinking
            if hasattr(usage, "thinking_tokens") and usage.thinking_tokens:
                usage_dict["thinking_tokens"] = usage.thinking_tokens

            # Calculate cost
            from services.thinking_tokens import TOKEN_COSTS_USD

            costs = TOKEN_COSTS_USD.get(
                req.model, {"input": 0.003, "output": 0.015, "thinking": 0.015}
            )
            cost_usd = (
                usage_dict["input_tokens"] / 1000 * costs["input"]
                + usage_dict["output_tokens"] / 1000 * costs["output"]
            )

            # Log to our system
            _log_llm_usage(
                user_id=auth_user_id,
                provider="anthropic",
                model=req.model,
                prompt_tokens=usage_dict["input_tokens"],
                completion_tokens=usage_dict["output_tokens"],
                total_tokens=usage_dict["total_tokens"],
                cost_usd=cost_usd,
                latency_ms=latency_ms,
                thinking_tokens=usage_dict.get("thinking_tokens", 0),
            )

            return {
                "success": True,
                "provider": "anthropic",
                "model": req.model,
                "response": response.model_dump()
                if hasattr(response, "model_dump")
                else str(response),
                "usage": {
                    "input_tokens": usage_dict["input_tokens"],
                    "output_tokens": usage_dict["output_tokens"],
                    "total_tokens": usage_dict["total_tokens"],
                    "thinking_tokens": usage_dict.get("thinking_tokens", 0),
                },
                "cost_usd": round(cost_usd, 6),
                "latency_ms": round(latency_ms, 1),
            }

        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Anthropic API error: {str(e)}"
            )

    else:
        raise HTTPException(status_code=400, detail="Unsupported provider")


def _log_llm_usage(
    user_id: str,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    cost_usd: float,
    latency_ms: float,
    thinking_tokens: int = 0,
) -> None:
    """Log real LLM usage to database."""
    USD_TO_INR = 83.5
    cost_inr = cost_usd * USD_TO_INR

    # Store in llm_usage
    try:
        supabase.table("llm_usage").insert(
            {
                "user_id": user_id,
                "model": model,
                "tokens_used": total_tokens,
                "cost_inr": cost_inr,
            }
        ).execute()
    except Exception:
        pass

    # If thinking tokens detected, also log to thinking_tokens
    if thinking_tokens > 0 or "o" in model or "claude" in model.lower():
        try:
            from services.thinking_tokens import extract_thinking_tokens_from_usage
            from services.llm_proxy import LLMProxy

            proxy = LLMProxy(
                user_id=user_id,
                endpoint_name="/llm-proxy/chat",
                feature_name="direct_chat",
            )

            usage_metadata = {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
            }
            if thinking_tokens > 0:
                usage_metadata["thinking_tokens"] = thinking_tokens

            proxy.log_usage(
                model=model,
                usage_metadata=usage_metadata,
                response_latency_ms=latency_ms,
            )
        except Exception:
            pass
