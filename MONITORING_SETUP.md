# DevPulse - Monitoring & Observability Setup

## Overview

Complete monitoring stack for DevPulse API Insights including metrics collection, visualization, error tracking, and alerting.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                      │
│         (FastAPI Backend + VS Code Extension)               │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼────┐        ┌──────▼──────┐
   │Prometheus       │   Sentry     │
   │ Metrics │       │ (Errors)     │
   └────┬────┘       └──────┬───────┘
        │                   │
        └───────┬───────────┘
                │
           ┌────▼────┐
           │ Grafana  │
           │(Dashboard)
           └──────────┘
```

## Prometheus Configuration

### File: `monitoring/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'devpulse-prod'
    environment: 'production'

scrape_configs:
  # Backend metrics
  - job_name: 'devpulse-backend'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'
    scrape_interval: 15s
    timeout: 10s

  # PostgreSQL metrics (via postgres_exporter)
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']

  # Redis metrics (via redis_exporter)
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']

  # Node metrics (system resources)
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - '/etc/prometheus/alert_rules.yml'
```

### Prometheus Alert Rules: `monitoring/alert_rules.yml`

```yaml
groups:
  - name: devpulse_alerts
    interval: 30s
    rules:
      # Backend health
      - alert: BackendDown
        expr: up{job="devpulse-backend"} == 0
        for: 2m
        annotations:
          summary: "DevPulse backend is down"
          description: "Backend {{ $labels.instance }} not responding"

      - alert: HighErrorRate
        expr: rate(devpulse_request_errors_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate ({{ $value | humanizePercentage }})"

      - alert: HighLatency
        expr: histogram_quantile(0.95, devpulse_request_duration_seconds) > 1.0
        for: 5m
        annotations:
          summary: "High p95 latency ({{ $value }}s)"

      # Database health
      - alert: DatabaseConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 5m
        annotations:
          summary: "High database connections ({{ $value }})"

      - alert: PostgresDown
        expr: up{job="postgres"} == 0
        for: 1m
        annotations:
          summary: "PostgreSQL is down"

      - alert: SlowestQuery
        expr: pg_slow_queries_total > 100
        annotations:
          summary: "Slow queries detected ({{ $value }})"

      # Redis health
      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        annotations:
          summary: "Redis is down"

      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        annotations:
          summary: "Redis memory usage high ({{ $value | humanizePercentage }})"

      # Application metrics
      - alert: ShadowAPIDetectionsSpike
        expr: increase(devpulse_shadow_api_detections_total[5m]) > 100
        annotations:
          summary: "Spike in shadow API detections"
          description: "{{ $value }} shadow APIs detected in last 5 minutes"

      - alert: ComplianceViolationsSpike
        expr: increase(devpulse_compliance_violations_total[5m]) > 50
        annotations:
          summary: "Spike in compliance violations"

      - alert: RiskScoreElevation
        expr: devpulse_avg_risk_score > 70
        for: 10m
        annotations:
          summary: "Average API risk score elevated ({{ $value }})"

      # System metrics
      - alert: CPUHigh
        expr: node_cpu_usage > 0.8
        for: 5m
        annotations:
          summary: "CPU usage high ({{ $value | humanizePercentage }})"

      - alert: DiskSpaceRunningOut
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
        for: 5m
        annotations:
          summary: "Disk space running out"
```

## Grafana Dashboards

### Main Dashboard Queries

```promql
# Request rate (requests/sec)
rate(devpulse_request_duration_seconds_count[1m])

# Error rate (errors/sec)
rate(devpulse_request_errors_total[1m])

# Latency (95th percentile)
histogram_quantile(0.95, devpulse_request_duration_seconds)

# Shadow APIs detected (last hour)
increase(devpulse_shadow_api_detections_total[1h])

# Compliance violation rate
rate(devpulse_compliance_violations_total[5m])

# Average risk score
devpulse_avg_risk_score

# Database connections
pg_stat_activity_count

# Redis memory usage
redis_memory_used_bytes / 1024 / 1024 / 1024
```

### Setting Up Grafana

```bash
# 1. Access Grafana at http://localhost:3000
# Default: admin/admin

# 2. Add Prometheus data source
# URL: http://prometheus:9090
# Save & Test

# 3. Import pre-built dashboards
# Dashboard ID: 1860 (Node Exporter)
# Dashboard ID: 3662 (Prometheus)
# Dashboard ID: 11074 (Node Exporter for Prometheus)

# 4. Create custom dashboard for DevPulse
# Add panels for metrics listed above
```

## Sentry Error Tracking

### Configuration

```python
# backend/main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    integrations=[
        FastApiIntegration(),
        StarletteIntegration(),
        SqlalchemyIntegration(),
    ],
    traces_sample_rate=0.1,  # 10% of transactions
    profiles_sample_rate=0.1,  # 10% of profiling
    environment=os.getenv("ENVIRONMENT", "production"),
    release=os.getenv("APP_VERSION", "unknown"),
)

app = FastAPI()

# Error monitoring middleware
@app.middleware("http")
async def sentry_middleware(request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
```

### Sentry Usage

```python
# Capture custom events
sentry_sdk.capture_message("Shadow API detected", level="info")

# Capture with context
with sentry_sdk.push_scope() as scope:
    scope.set_context("api_endpoint", {
        "path": "/api/users",
        "risk_score": 85,
    })
    sentry_sdk.capture_exception(error)

# Track performance
@sentry_sdk.trace
def slow_operation():
    time.sleep(2)
```

## ELK Stack (Optional - For Log Aggregation)

### Docker Compose Addition

```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
  environment:
    - discovery.type=single-node
  volumes:
    - elasticsearch_data:/usr/share/elasticsearch/data

kibana:
  image: docker.elastic.co/kibana/kibana:8.0.0
  ports:
    - "5601:5601"
  depends_on:
    - elasticsearch

logstash:
  image: docker.elastic.co/logstash/logstash:8.0.0
  volumes:
    - ./monitoring/logstash.conf:/usr/share/logstash/pipeline/logstash.conf
  depends_on:
    - elasticsearch
```

### Logstash Configuration

```
input {
  tcp {
    port => 5000
    codec => json
  }
}

filter {
  json {
    source => "message"
  }
}

output {
  elasticsearch {
    hosts => "elasticsearch:9200"
    index => "devpulse-%{+YYYY.MM.dd}"
  }
}
```

## Logging Best Practices

### Structured Logging

```python
import json
import logging

# JSON formatter
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "context": getattr(record, "context", {}),
        })

# Configure
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)

# Usage
logger.info("Shadow API detected", extra={
    "context": {
        "endpoint": "/api/users",
        "risk_score": 85,
        "anomaly_type": "UNAUTHORIZED_METHOD"
    }
})
```

### Log Levels

- **DEBUG**: Development debugging
- **INFO**: Important events (detection, compliance check)
- **WARNING**: Unusual conditions (high risk score)
- **ERROR**: Error conditions (detection failure)
- **CRITICAL**: System failures (database down)

## Health & Readiness Checks

### Kubernetes Probes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: devpulse-backend
spec:
  containers:
    - name: backend
      image: devpulse-backend:latest
      
      # Liveness check (is app alive?)
      livenessProbe:
        httpGet:
          path: /live
          port: 8000
        initialDelaySeconds: 10
        periodSeconds: 30
        timeoutSeconds: 5
        failureThreshold: 3

      # Readiness check (is app ready for traffic?)
      readinessProbe:
        httpGet:
          path: /ready
          port: 8000
        initialDelaySeconds: 5
        periodSeconds: 10
        timeoutSeconds: 5
        failureThreshold: 3
```

## Metrics Endpoints

```bash
# All application metrics
GET /metrics
# Returns Prometheus-compatible metrics

# Health status
GET /health
# Returns: {"status": "healthy"}

# Readiness (includes dependencies)
GET /ready
# Returns: {"status": "ready", "checks": {...}}

# Liveness (simple check)
GET /live
# Returns: {"status": "alive"}
```

## Dashboard Scheduled Reports

```python
# Daily report email
# Send to: alerts@company.com
# Includes:
# - API requests/errors
# - Average risk score
# - Shadow APIs detected
# - Compliance violations
# - Performance metrics

# Weekly report
# Same metrics but aggregated weekly
# Include trends and recommendations
```

## Alerting Channels

- **Slack**: For critical alerts
- **Email**: For daily/weekly summaries
- **PagerDuty**: For on-call integration
- **Custom Webhooks**: For integration with other systems

### Configure Alertmanager

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'YOUR_SLACK_WEBHOOK'

route:
  receiver: 'devpulse-alerts'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h

receivers:
  - name: 'devpulse-alerts'
    slack_configs:
      - channel: '#devpulse-alerts'
        title: 'DevPulse Alert'
        template: 'alert.tmpl'
```

---

**Monitoring Stack**: Production-grade observability with metrics, logs, errors, and alerts.
