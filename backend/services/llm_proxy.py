"""
LLM Proxy Middleware — DevPulse Patent 2
Intercepts OpenAI and Anthropic API responses to extract, classify, and
attribute thinking/reasoning tokens before storing structured cost records.

Usage
-----
Wrap any LLM call through the proxy:

    from services.llm_proxy import LLMProxy

    proxy = LLMProxy(user_id="uuid", endpoint_name="/scan", feature_name="owasp_check")

    # OpenAI
    result = proxy.openai_chat(
        client=openai_client,
        model="o3-mini",
        messages=[{"role": "user", "content": "Analyze this API..."}],
    )

    # Anthropic
    result = proxy.anthropic_messages(
        client=anthropic_client,
        model="claude-3-7-sonnet-20250219",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Analyze this API..."}],
    )

Both methods return the raw provider response unchanged, but also
log a structured ThinkingTokenRecord to Supabase via the attribution engine.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any

from services.thinking_tokens import extract_thinking_tokens_from_usage

# ---------------------------------------------------------------------------
# Structured record written to Supabase thinking_token_logs
# ---------------------------------------------------------------------------


@dataclass
class ThinkingTokenRecord:
    user_id: str
    provider: str  # openai | anthropic | google
    model: str
    endpoint_name: str  # e.g. /scan, /compliance
    feature_name: str  # e.g. owasp_check, cost_forecast
    input_tokens: int
    output_tokens: int
    thinking_tokens: int
    total_tokens: int
    detection_method: str  # direct_field_openai | direct_field_anthropic
    # differential_computation | timing_signature_estimate | none
    input_cost_usd: float
    output_cost_usd: float
    thinking_cost_usd: float
    total_cost_usd: float
    thinking_cost_inr: float
    total_cost_inr: float
    thinking_overhead_multiplier: float
    is_thinking_anomaly: bool
    response_latency_ms: float
    ms_per_output_token: float
    optimization_recommendation: str
    recorded_at: str


# ---------------------------------------------------------------------------
# Token classifier: maps raw usage dicts to classified token counts
# ---------------------------------------------------------------------------


class TokenClassifier:
    """
    Classifies raw LLM usage metadata into prompt / completion / thinking
    token categories regardless of provider format.

    Supported formats
    -----------------
    OpenAI
        {
          "prompt_tokens": 512,
          "completion_tokens": 128,
          "total_tokens": 1640,
          "completion_tokens_details": {"reasoning_tokens": 1000}
        }

    Anthropic
        {
          "input_tokens": 512,
          "output_tokens": 128,
          "thinking_tokens": 1000          # extended thinking enabled
        }

    Generic (total - prompt - completion = thinking)
        {
          "prompt_tokens": 512,
          "completion_tokens": 128,
          "total_tokens": 1640
        }
    """

    @staticmethod
    def classify(usage: dict[str, Any]) -> dict[str, int]:
        """
        Returns {"prompt": int, "completion": int, "thinking": int, "total": int}.
        thinking = 0 when not detectable; differential used as fallback.
        """
        prompt = int(usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0))
        completion = int(
            usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
        )

        # Method 1 — OpenAI direct field
        thinking = 0
        details = usage.get("completion_tokens_details", {})
        if isinstance(details, dict):
            thinking = int(details.get("reasoning_tokens", 0) or 0)

        # Method 2 — Anthropic direct field
        if thinking == 0:
            thinking = int(usage.get("thinking_tokens", 0) or 0)

        # Method 3 — Differential computation
        if thinking == 0:
            total_reported = int(usage.get("total_tokens", 0))
            if total_reported > prompt + completion:
                thinking = total_reported - prompt - completion

        total = prompt + completion + thinking

        return {
            "prompt": prompt,
            "completion": completion,
            "thinking": thinking,
            "total": total,
        }

    @staticmethod
    def is_reasoning_model(model: str) -> bool:
        """Returns True if the model is known to produce thinking tokens."""
        from services.thinking_tokens import THINKING_TOKEN_MODELS

        model_lower = model.lower()
        return any(m in model_lower for m in THINKING_TOKEN_MODELS)

    @staticmethod
    def timing_suggests_thinking(latency_ms: float, output_tokens: int) -> bool:
        """
        Heuristic: >30 ms per output token implies hidden reasoning chain.
        Standard non-reasoning models average 5-15 ms/token.
        """
        if output_tokens <= 0 or latency_ms <= 0:
            return False
        return (latency_ms / output_tokens) > 30.0


# ---------------------------------------------------------------------------
# Main proxy class
# ---------------------------------------------------------------------------


class LLMProxy:
    """
    Thin wrapper around OpenAI and Anthropic clients that:
    1. Times the API call
    2. Extracts and classifies token usage (including hidden thinking tokens)
    3. Attributes costs to endpoint + feature
    4. Persists a ThinkingTokenRecord to Supabase
    5. Returns the original provider response unchanged
    """

    def __init__(
        self,
        user_id: str,
        endpoint_name: str = "",
        feature_name: str = "",
        auto_persist: bool = True,
    ) -> None:
        self.user_id = user_id
        self.endpoint_name = endpoint_name
        self.feature_name = feature_name
        self.auto_persist = auto_persist

    # ------------------------------------------------------------------
    # OpenAI
    # ------------------------------------------------------------------

    def openai_chat(
        self,
        client: Any,
        model: str,
        messages: list[dict],
        **kwargs: Any,
    ) -> Any:
        """
        Wraps client.chat.completions.create().
        Intercepts the response to attribute token costs.
        Returns the original ChatCompletion object.
        """
        start = time.monotonic()
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs,
        )
        latency_ms = (time.monotonic() - start) * 1000.0

        usage_dict = self._openai_usage_to_dict(response)
        record = self._build_record(
            model=model, usage_dict=usage_dict, latency_ms=latency_ms
        )

        if self.auto_persist:
            self._persist(record)

        return response

    @staticmethod
    def _openai_usage_to_dict(response: Any) -> dict[str, Any]:
        """Convert OpenAI Usage object to plain dict."""
        usage = getattr(response, "usage", None)
        if usage is None:
            return {}
        result: dict[str, Any] = {
            "prompt_tokens": getattr(usage, "prompt_tokens", 0),
            "completion_tokens": getattr(usage, "completion_tokens", 0),
            "total_tokens": getattr(usage, "total_tokens", 0),
        }
        details = getattr(usage, "completion_tokens_details", None)
        if details is not None:
            result["completion_tokens_details"] = {
                "reasoning_tokens": getattr(details, "reasoning_tokens", 0),
                "audio_tokens": getattr(details, "audio_tokens", 0),
            }
        return result

    # ------------------------------------------------------------------
    # Anthropic
    # ------------------------------------------------------------------

    def anthropic_messages(
        self,
        client: Any,
        model: str,
        messages: list[dict],
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> Any:
        """
        Wraps client.messages.create().
        Intercepts the response to attribute token costs.
        Returns the original Message object.
        """
        start = time.monotonic()
        response = client.messages.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            **kwargs,
        )
        latency_ms = (time.monotonic() - start) * 1000.0

        usage_dict = self._anthropic_usage_to_dict(response)
        record = self._build_record(
            model=model, usage_dict=usage_dict, latency_ms=latency_ms
        )

        if self.auto_persist:
            self._persist(record)

        return response

    @staticmethod
    def _anthropic_usage_to_dict(response: Any) -> dict[str, Any]:
        """Convert Anthropic Usage object to plain dict."""
        usage = getattr(response, "usage", None)
        if usage is None:
            return {}

        result: dict[str, Any] = {
            "input_tokens": getattr(usage, "input_tokens", 0),
            "output_tokens": getattr(usage, "output_tokens", 0),
        }

        # Anthropic extended thinking: thinking_tokens in usage
        thinking = getattr(usage, "thinking_tokens", None)
        if thinking is not None:
            result["thinking_tokens"] = thinking

        # Some versions expose cache tokens separately
        cache_creation = getattr(usage, "cache_creation_input_tokens", None)
        cache_read = getattr(usage, "cache_read_input_tokens", None)
        if cache_creation is not None:
            result["cache_creation_input_tokens"] = cache_creation
        if cache_read is not None:
            result["cache_read_input_tokens"] = cache_read

        return result

    # ------------------------------------------------------------------
    # Manual log — for existing integrations that already have usage data
    # ------------------------------------------------------------------

    def log_usage(
        self,
        model: str,
        usage_metadata: dict[str, Any],
        response_latency_ms: float = 0.0,
    ) -> ThinkingTokenRecord:
        """
        Log an LLM call where you already have the raw usage dict.
        Useful when the LLM client is called elsewhere and you only
        have the response metadata.

        Returns the ThinkingTokenRecord for inspection.
        """
        record = self._build_record(
            model=model,
            usage_dict=usage_metadata,
            latency_ms=response_latency_ms,
        )
        if self.auto_persist:
            self._persist(record)
        return record

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_record(
        self,
        model: str,
        usage_dict: dict[str, Any],
        latency_ms: float,
    ) -> ThinkingTokenRecord:
        """Run attribution engine and return a structured record."""
        attr = extract_thinking_tokens_from_usage(
            model=model,
            usage_metadata=usage_dict,
            response_latency_ms=latency_ms,
        )

        # Determine provider from normalized model name
        from services.thinking_tokens import THINKING_TOKEN_MODELS

        normalized = attr["normalized_model"]
        provider = THINKING_TOKEN_MODELS.get(normalized, {}).get("provider", "openai")

        return ThinkingTokenRecord(
            user_id=self.user_id,
            provider=provider,
            model=model,
            endpoint_name=self.endpoint_name,
            feature_name=self.feature_name,
            input_tokens=attr["tokens"]["input"],
            output_tokens=attr["tokens"]["output"],
            thinking_tokens=attr["tokens"]["thinking"],
            total_tokens=attr["tokens"]["total"],
            detection_method=attr["detection_method"],
            input_cost_usd=attr["cost_usd"]["input"],
            output_cost_usd=attr["cost_usd"]["output"],
            thinking_cost_usd=attr["cost_usd"]["thinking"],
            total_cost_usd=attr["cost_usd"]["total"],
            thinking_cost_inr=attr["cost_inr"]["thinking"],
            total_cost_inr=attr["cost_inr"]["total"],
            thinking_overhead_multiplier=attr["thinking_overhead_multiplier"],
            is_thinking_anomaly=attr["is_thinking_anomaly"],
            response_latency_ms=latency_ms,
            ms_per_output_token=attr["ms_per_output_token"],
            optimization_recommendation=attr["optimization_recommendation"],
            recorded_at=datetime.now(timezone.utc).isoformat(),
        )

    def _persist(self, record: ThinkingTokenRecord) -> None:
        """Write record to Supabase thinking_token_logs table."""
        try:
            from services.supabase_client import supabase

            row = asdict(record)
            supabase.table("thinking_token_logs").insert(row).execute()
        except Exception:
            # Non-fatal: proxy never breaks the caller's LLM call
            pass
