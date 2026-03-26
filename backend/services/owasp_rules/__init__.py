"""
OWASP API Security Top 10 — Rule modules.

Each module defines scan rules decorated with @register_rule.
Rules are auto-loaded by owasp_engine._load_rules().
"""

# Import all rule modules to trigger @register_rule decorators
from services.owasp_rules import bola  # noqa: F401
from services.owasp_rules import broken_auth  # noqa: F401
from services.owasp_rules import data_exposure  # noqa: F401
from services.owasp_rules import mass_assignment  # noqa: F401
from services.owasp_rules import misconfiguration  # noqa: F401
from services.owasp_rules import rate_limiting  # noqa: F401
from services.owasp_rules import injection  # noqa: F401

__all__ = [
    "bola",
    "broken_auth",
    "data_exposure",
    "mass_assignment",
    "misconfiguration",
    "rate_limiting",
    "injection",
]
