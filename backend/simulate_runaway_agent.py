"""
Runaway Agent Simulation — DevPulse Kill Switch Test Script
Simulates three distinct runaway scenarios to verify the kill switch
triggers correctly and stops the agent autonomously.

Scenarios
---------
1. RATE_LIMIT      — agent fires 30 requests in 2 seconds  (10x safe limit)
2. INFINITE_LOOP   — agent hammers one endpoint 25 times in a tight burst
3. COST_SPIKE      — agent makes LLM calls totalling > INR50/min threshold
4. THINKING_ANOMALY— single call with 30x thinking overhead (runaway reasoning)

Run directly (no FastAPI server required — uses the engine in-process):
    python simulate_runaway_agent.py
"""

from __future__ import annotations

import sys
import time

# Add backend to path so services imports resolve
sys.path.insert(0, __file__.rsplit("\\", 1)[0] if "\\" in __file__ else ".")

from services.kill_switch import KillSwitchConfig, KillSwitchEngine, TripReason

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RESET = "\033[0m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"


def section(title: str) -> None:
    print(f"\n{BOLD}{CYAN}{'=' * 60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'=' * 60}{RESET}")


def ok(msg: str) -> None:
    print(f"  {GREEN}[OK]{RESET}  {msg}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}[--]{RESET}  {msg}")


def trip(msg: str) -> None:
    print(f"  {RED}[TRIP]{RESET} {msg}")


def make_engine() -> KillSwitchEngine:
    """Create a fresh engine with tight thresholds for quick simulation."""
    config = KillSwitchConfig(
        max_requests_per_second=3.0,  # Trip if >3 req/s
        request_window_seconds=5.0,
        loop_burst_threshold=10,  # Trip if >10 calls to same endpoint in window
        max_cost_per_minute_inr=20.0,  # Trip if >INR20 in 60s
        max_cost_per_hour_inr=100.0,
        max_daily_cost_inr=500.0,
        max_thinking_overhead_multiplier=20.0,  # Trip if >20x thinking overhead
        block_duration_seconds=10.0,  # Short block for simulation
    )
    return KillSwitchEngine(config)


# ---------------------------------------------------------------------------
# Scenario 1: Rate-limit trip
# ---------------------------------------------------------------------------


def scenario_rate_limit() -> None:
    section("SCENARIO 1: Rapid API Calls (Rate Limit)")
    engine = make_engine()
    agent_id = "agent-rate-test-001"
    user_id = "user-sim-001"

    print(
        f"  Config: max {engine.config.max_requests_per_second} req/s "
        f"over {engine.config.request_window_seconds}s window"
    )
    print(f"  Firing 25 requests with no delay...\n")

    tripped_at = None
    for i in range(1, 26):
        # Check if already blocked
        blocked, msg = engine.is_blocked(agent_id)
        if blocked:
            warn(f"Request {i:02d} BLOCKED (already tripped): {msg}")
            continue

        event = engine.record_request(
            agent_id=agent_id,
            user_id=user_id,
            endpoint="/api/scan",
        )
        if event:
            tripped_at = i
            trip(
                f"Request {i:02d} TRIPPED kill switch!"
                f" reason={event.reason.value}"
                f" | {event.detail}"
            )
        else:
            ok(f"Request {i:02d} passed")

    status = engine.get_status(agent_id)
    print(f"\n  Final status : {status['status']}")
    print(f"  Request rate : {status['metrics']['request_rate_per_s']} req/s")
    print(f"  Trip count   : {status['trip_count']}")
    assert tripped_at is not None, "FAIL: kill switch never tripped!"
    print(f"\n  {GREEN}PASS{RESET}: Agent stopped at request #{tripped_at}")


# ---------------------------------------------------------------------------
# Scenario 2: Infinite-loop detection
# ---------------------------------------------------------------------------


def scenario_infinite_loop() -> None:
    section("SCENARIO 2: Infinite Loop (Repeated Endpoint)")
    engine = make_engine()
    agent_id = "agent-loop-test-002"
    user_id = "user-sim-001"

    print(
        f"  Config: trip if >{engine.config.loop_burst_threshold} calls "
        f"to same endpoint in {engine.config.request_window_seconds}s\n"
    )

    # Mix normal calls on different endpoints first
    for ep in ["/api/compliance", "/api/postman", "/api/alerts"]:
        engine.record_request(agent_id=agent_id, user_id=user_id, endpoint=ep)
        ok(f"Normal call to {ep}")

    print()
    print("  Now agent starts looping on /api/scan ...\n")

    tripped_at = None
    for i in range(1, 20):
        blocked, msg = engine.is_blocked(agent_id)
        if blocked:
            warn(f"  Loop call {i:02d} BLOCKED: {msg}")
            continue

        event = engine.record_request(
            agent_id=agent_id,
            user_id=user_id,
            endpoint="/api/scan",
        )
        if event:
            tripped_at = i
            trip(
                f"  Loop call {i:02d} TRIPPED! reason={event.reason.value}"
                f" | {event.detail}"
            )
        else:
            ok(f"  Loop call {i:02d} to /api/scan")

    assert tripped_at is not None, "FAIL: loop never tripped!"
    print(f"\n  {GREEN}PASS{RESET}: Infinite loop stopped at call #{tripped_at}")


# ---------------------------------------------------------------------------
# Scenario 3: Cost velocity spike
# ---------------------------------------------------------------------------


def scenario_cost_spike() -> None:
    section("SCENARIO 3: Cost Velocity Spike (LLM Runaway)")
    engine = make_engine()
    agent_id = "agent-cost-test-003"
    user_id = "user-sim-001"

    print(f"  Config: max INR{engine.config.max_cost_per_minute_inr}/min\n")

    calls = [
        ("o1", 5.00),
        ("o1", 7.50),
        ("claude-opus-4", 8.00),
        ("o3", 6.00),  # cumulative = INR26.5
        ("o3", 8.00),  # cumulative = INR34.5 — should trip here or next
        ("claude-opus-4", 9.00),  # cumulative = INR43.5
        ("o1", 10.00),  # cumulative = INR53.5 — must trip
    ]

    tripped_at = None
    cumulative = 0.0
    for i, (model, cost) in enumerate(calls, 1):
        cumulative += cost
        blocked, msg = engine.is_blocked(agent_id)
        if blocked:
            warn(
                f"  Call {i:02d} BLOCKED (cost=INR{cost:.2f}, cumulative=INR{cumulative:.2f}): {msg}"
            )
            continue

        event = engine.record_llm_call(
            agent_id=agent_id,
            user_id=user_id,
            cost_inr=cost,
            model=model,
        )
        if event:
            tripped_at = i
            trip(
                f"  Call {i:02d} TRIPPED! model={model} cost=INR{cost:.2f}"
                f" | {event.detail}"
            )
        else:
            ok(
                f"  Call {i:02d} model={model} cost=INR{cost:.2f} (window total=INR{cumulative:.2f})"
            )

    status = engine.get_status(agent_id)
    print(f"\n  Cost last minute : INR{status['metrics']['cost_last_minute_inr']}")
    assert tripped_at is not None, "FAIL: cost spike never tripped!"
    print(f"\n  {GREEN}PASS{RESET}: Cost spike blocked at call #{tripped_at}")


# ---------------------------------------------------------------------------
# Scenario 4: Thinking-token anomaly (runaway reasoning chain)
# ---------------------------------------------------------------------------


def scenario_thinking_anomaly() -> None:
    section("SCENARIO 4: Thinking Token Anomaly (Runaway Reasoning)")
    engine = make_engine()
    agent_id = "agent-think-test-004"
    user_id = "user-sim-001"

    print(
        f"  Config: max thinking overhead = {engine.config.max_thinking_overhead_multiplier}x\n"
    )

    normal_calls = [
        ("o3-mini", 1.20, 2.5),
        ("o3-mini", 0.90, 3.1),
        ("o3-mini", 1.50, 4.0),
    ]
    for i, (model, cost, overhead) in enumerate(normal_calls, 1):
        event = engine.record_llm_call(
            agent_id=agent_id,
            user_id=user_id,
            cost_inr=cost,
            thinking_overhead_multiplier=overhead,
            model=model,
        )
        ok(f"  Normal call {i}: model={model} cost=INR{cost} overhead={overhead}x")

    print()
    print("  Sending call with 30x thinking overhead (runaway reasoning chain)...\n")

    event = engine.record_llm_call(
        agent_id=agent_id,
        user_id=user_id,
        cost_inr=45.0,
        thinking_overhead_multiplier=30.0,  # Far exceeds 20x threshold
        model="claude-opus-4",
    )

    if event:
        trip(f"  TRIPPED! reason={event.reason.value} | {event.detail}")
        print(
            f"\n  {GREEN}PASS{RESET}: Thinking anomaly blocked (30x overhead detected)"
        )
    else:
        print(f"  {RED}FAIL{RESET}: Thinking anomaly was NOT caught!")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Scenario 5: Manual kill + auto-release
# ---------------------------------------------------------------------------


def scenario_manual_kill_and_release() -> None:
    section("SCENARIO 5: Manual Kill + Auto-Release")
    engine = make_engine()  # block_duration_seconds=10
    agent_id = "agent-manual-005"
    user_id = "user-sim-001"

    print("  Triggering manual kill...\n")
    event = engine.manual_kill(agent_id, user_id, reason="Simulation test")
    trip(f"  Manual kill issued | auto_release_at={event.auto_release_at}")

    blocked, msg = engine.is_blocked(agent_id)
    assert blocked, "FAIL: agent should be blocked after manual kill"
    ok(f"  Agent is blocked: {msg}")

    print("\n  Manually releasing before auto-release timer...\n")
    released = engine.release(agent_id)
    assert released, "FAIL: release returned False"

    blocked2, _ = engine.is_blocked(agent_id)
    assert not blocked2, "FAIL: agent still blocked after manual release"
    ok(f"  Agent released successfully")
    print(f"\n  {GREEN}PASS{RESET}: Manual kill + release cycle works correctly")


# ---------------------------------------------------------------------------
# Scenario 6: API key blocking
# ---------------------------------------------------------------------------


def scenario_api_key_block() -> None:
    section("SCENARIO 6: API Key Blocking")
    engine = make_engine()
    key_id = "sk-openai-prod-key-abcdef"

    assert not engine.is_api_key_blocked(key_id)
    ok(f"  Key '{key_id[:20]}...' is initially unblocked")

    engine.block_api_key(key_id)
    assert engine.is_api_key_blocked(key_id)
    trip(f"  Key blocked")

    engine.unblock_api_key(key_id)
    assert not engine.is_api_key_blocked(key_id)
    ok(f"  Key unblocked")

    print(f"\n  {GREEN}PASS{RESET}: API key block/unblock works correctly")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print(f"\n{BOLD}DevPulse Kill Switch — Runaway Agent Simulation{RESET}")
    print("All scenarios run in-process (no server required)\n")

    scenario_rate_limit()
    scenario_infinite_loop()
    scenario_cost_spike()
    scenario_thinking_anomaly()
    scenario_manual_kill_and_release()
    scenario_api_key_block()

    print(f"\n{BOLD}{GREEN}{'=' * 60}{RESET}")
    print(f"{BOLD}{GREEN}  ALL SCENARIOS PASSED — Kill switch working correctly{RESET}")
    print(f"{BOLD}{GREEN}{'=' * 60}{RESET}\n")


if __name__ == "__main__":
    main()
