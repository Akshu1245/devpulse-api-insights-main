"""Alert dispatcher — delivers alerts to configured channels (email, Slack webhook).

Channels run concurrently via asyncio so near-real-time delivery is achieved
without blocking the originating request.
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger("alert_dispatcher")


# ── Types ────────────────────────────────────────────────────────────────────


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AlertType(str, Enum):
    VULNERABILITY = "vulnerability"
    COST_SPIKE = "cost_spike"


class ChannelType(str, Enum):
    EMAIL = "email"
    SLACK = "slack"


@dataclass
class AlertEvent:
    """Single alert to be dispatched."""

    alert_type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    user_id: str
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class ChannelConfig:
    """Per-channel delivery configuration."""

    channel: ChannelType
    enabled: bool = True
    # Email
    email_to: str | None = None
    # Slack
    slack_webhook_url: str | None = None


# ── Channel implementations ─────────────────────────────────────────────────


async def _send_email(alert: AlertEvent, to: str) -> None:
    """Send alert via SMTP (configured through env vars)."""
    smtp_host = os.getenv("ALERT_SMTP_HOST", "")
    smtp_port = int(os.getenv("ALERT_SMTP_PORT", "587"))
    smtp_user = os.getenv("ALERT_SMTP_USER", "")
    smtp_pass = os.getenv("ALERT_SMTP_PASS", "")
    from_addr = os.getenv("ALERT_SMTP_FROM", smtp_user)

    if not smtp_host or not smtp_user:
        logger.warning("SMTP not configured — skipping email alert")
        return

    subject = f"[DevPulse {alert.severity.value.upper()}] {alert.title}"
    body = _render_email_body(alert)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(body, "html"))

    def _smtp_send() -> None:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_addr, [to], msg.as_string())

    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _smtp_send)
        logger.info("Email alert sent to %s", to)
    except Exception:
        logger.exception("Failed to send email alert to %s", to)


def _render_email_body(alert: AlertEvent) -> str:
    severity_color = {
        AlertSeverity.CRITICAL: "#dc2626",
        AlertSeverity.HIGH: "#ea580c",
        AlertSeverity.MEDIUM: "#ca8a04",
        AlertSeverity.LOW: "#2563eb",
        AlertSeverity.INFO: "#6b7280",
    }.get(alert.severity, "#6b7280")

    meta_rows = "".join(
        f'<tr><td style="padding:4px 8px;color:#6b7280">{k}</td>'
        f'<td style="padding:4px 8px">{v}</td></tr>'
        for k, v in alert.metadata.items()
    )

    return f"""\
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="border-left:4px solid {severity_color};padding:12px 16px;background:#f9fafb;margin-bottom:16px">
  <span style="color:{severity_color};font-weight:700;text-transform:uppercase;font-size:12px">
    {alert.severity.value}
  </span>
  <h2 style="margin:4px 0 0">{alert.title}</h2>
</div>
<p>{alert.message}</p>
{"<table style='border-collapse:collapse;margin-top:12px'>" + meta_rows + "</table>" if meta_rows else ""}
<p style="color:#9ca3af;font-size:12px;margin-top:24px">
  DevPulse Alert &mdash; {alert.timestamp}
</p>
</body></html>"""


async def _send_slack(alert: AlertEvent, webhook_url: str) -> None:
    """Post alert to a Slack incoming webhook."""
    severity_emoji = {
        AlertSeverity.CRITICAL: ":rotating_light:",
        AlertSeverity.HIGH: ":warning:",
        AlertSeverity.MEDIUM: ":large_yellow_circle:",
        AlertSeverity.LOW: ":information_source:",
        AlertSeverity.INFO: ":bell:",
    }.get(alert.severity, ":bell:")

    meta_text = "\n".join(f"• *{k}:* {v}" for k, v in alert.metadata.items())

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{severity_emoji} {alert.title}",
                },
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": alert.message},
            },
            *(
                [
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": meta_text},
                    }
                ]
                if meta_text
                else []
            ),
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Type:* {alert.alert_type.value}  |  "
                        f"*Severity:* {alert.severity.value}  |  "
                        f"*User:* `{alert.user_id}`",
                    }
                ],
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
        logger.info("Slack alert dispatched (user=%s)", alert.user_id)
    except Exception:
        logger.exception("Failed to send Slack alert for user %s", alert.user_id)


# ── Dispatcher ───────────────────────────────────────────────────────────────


_CHANNEL_SENDERS = {
    ChannelType.EMAIL: _send_email,
    ChannelType.SLACK: _send_slack,
}


async def dispatch_alert(
    alert: AlertEvent,
    channels: list[ChannelConfig],
) -> None:
    """Fan-out an alert to all enabled channels concurrently."""
    tasks: list[asyncio.Task[None]] = []

    for ch in channels:
        if not ch.enabled:
            continue
        sender = _CHANNEL_SENDERS.get(ch.channel)
        if sender is None:
            logger.warning("Unknown channel type: %s", ch.channel)
            continue

        if ch.channel == ChannelType.EMAIL and ch.email_to:
            tasks.append(asyncio.create_task(sender(alert, ch.email_to)))
        elif ch.channel == ChannelType.SLACK and ch.slack_webhook_url:
            tasks.append(asyncio.create_task(sender(alert, ch.slack_webhook_url)))

    if tasks:
        # Fire-and-forget with exception logging; never block caller
        done, _ = await asyncio.wait(tasks, timeout=30)
        for t in done:
            if t.exception():
                logger.error("Channel dispatch error: %s", t.exception())


def dispatch_alert_background(
    alert: AlertEvent,
    channels: list[ChannelConfig],
) -> None:
    """Schedule alert dispatch in the background (non-blocking)."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(dispatch_alert(alert, channels))
    except RuntimeError:
        # No running loop — run synchronously as fallback
        asyncio.run(dispatch_alert(alert, channels))
