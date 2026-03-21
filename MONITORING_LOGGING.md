# Production Monitoring & Logging Guide

## Real-Time Monitoring

### Health Check Endpoint

**Endpoint:** `GET /functions/v1/health-check`

```bash
# Monitor system health
curl -X GET https://your-project.supabase.co/functions/v1/health-check \
  -H "Authorization: Bearer your_anon_key"

# Response Example (status: ok)
{
  "status": "ok",
  "timestamp": "2026-03-21T10:30:00Z",
  "services": {
    "database": {
      "status": "ok",
      "latency_ms": 14
    },
    "auth": {
      "status": "ok",
      "latency_ms": 22
    },
    "storage": {
      "status": "ok",
      "latency_ms": 8
    },
    "api_keys": {
      "status": "ok",
      "latency_ms": 11
    }
  },
  "version": "1.0.0"
}

# Response Example (status: degraded)
{
  "status": "degraded",
  "services": {
    "database": {
      "status": "ok",
      "latency_ms": 45
    },
    "auth": {
      "status": "degraded",
      "latency_ms": 2500
    }
  }
}
```

**Interpretation:**
- Status: `ok` → All systems operational
- Status: `degraded` → Service is running but slow
- Status: `error` → Critical service down (HTTP 503)

### Automated Health Monitoring

Set up cron job to check health every 5 minutes:

```bash
#!/bin/bash
# health-monitor.sh

ENDPOINT="https://your-project.supabase.co/functions/v1/health-check"
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

response=$(curl -s -w "\n%{http_code}" "$ENDPOINT")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)
status=$(echo "$body" | jq -r '.status')

if [ "$http_code" != "200" ] || [ "$status" = "error" ]; then
  curl -X POST $SLACK_WEBHOOK -H 'Content-type: application/json' \
    --data "{\"text\":\"⚠️ DevPulse Health Check Failed: HTTP $http_code, Status: $status\"}"
fi
```

---

## Supabase Logs

### Access Logs

**Location:** Supabase Dashboard > Logs

#### Database Logs
```sql
-- View recent queries
SELECT 
  timestamp,
  user,
  application_name,
  query
FROM pg_stat_statements
ORDER BY timestamp DESC
LIMIT 100;
```

#### Edge Function Logs
```
Dashboard > Functions > Select function > Logs tab

Shows:
- Execution time
- Status code
- Error messages
- Request/response details
```

#### Authentication Logs
```
Dashboard > Auth > User Management > Logs tab

Shows:
- Login/logout events
- Password resets
- Account changes
- Failed auth attempts
```

---

## Application Performance Tracking

### Key Metrics to Monitor

```
1. Health Check Latency
   Target: < 100ms
   Alert if: > 500ms

2. Database Response Time
   Target: < 50ms
   Alert if: > 200ms

3. Edge Function Duration
   Target: < 1000ms
   Alert if: > 3000ms

4. Encryption/Decryption Time
   Target: < 100ms
   Alert if: > 500ms

5. Error Rate
   Target: < 0.1%
   Alert if: > 1%
```

### Query Performance

```sql
-- Slow queries (duration > 1 second)
SELECT 
  mean_time,
  calls,
  query
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 20;

-- Most called queries
SELECT 
  calls,
  mean_time * calls as total_time,
  query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;

-- Index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

---

## Audit Log Monitoring

### View Audit Events

```sql
-- Recent API key operations
SELECT 
  id,
  user_id,
  action,
  resource_type,
  status,
  created_at
FROM audit_log
WHERE resource_type = 'user_api_keys'
ORDER BY created_at DESC
LIMIT 50;

-- Failed operations
SELECT 
  id,
  user_id,
  action,
  error_message,
  ip_address,
  created_at
FROM audit_log
WHERE status = 'error'
ORDER BY created_at DESC
LIMIT 20;

-- Suspicious activity (multiple failures)
SELECT 
  user_id,
  action,
  count(*) as attempt_count,
  max(created_at) as latest
FROM audit_log
WHERE 
  status = 'error' 
  AND created_at > now() - interval '1 hour'
GROUP BY user_id, action
HAVING count(*) > 5;

-- Activity by user
SELECT 
  user_id,
  action,
  count(*) as count,
  max(created_at) as latest
FROM audit_log
WHERE created_at > now() - interval '24 hours'
GROUP BY user_id, action
ORDER BY count DESC;
```

---

## Error Handling & Alerts

### Common Errors to Monitor

| Error | Cause | Action |
|-------|-------|--------|
| `KEY_ENCRYPTION_SECRET not set` | Env var missing | Set in Edge Function settings |
| `Auth error: Invalid token` | Expired/invalid JWT | Check token generation |
| `Database connection timeout` | Connection pool exhausted | Scale up connection pool |
| `Decrypt failed` | Secret mismatch | Verify encryption secret matches |
| `Row Level Security violation` | RLS policy block | Review RLS policies |

### Set Up Error Alerts

**In Supabase Dashboard > Functions:**

1. Select function
2. Click "Logs"
3. Set up alert for error status codes
4. Configure Slack/email notifications

**Custom Alert Logic:**

```javascript
// Monitor Edge Function errors
const checkErrors = async () => {
  const res = await fetch(
    `https://your-project.supabase.co/functions/v1/user-api-keys`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid_token', // Intentional error
      },
    }
  );

  if (res.status >= 500) {
    // Send alert
    console.error('Function error detected:', res.status);
  }
};
```

---

## User Activity Monitoring

### Track API Key Usage

```sql
-- API keys added this week
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as keys_added
FROM user_api_keys
WHERE created_at > now() - interval '7 days'
GROUP BY date
ORDER BY date;

-- Most active users
SELECT 
  user_id,
  COUNT(*) as api_operations,
  MAX(created_at) as last_activity
FROM audit_log
WHERE created_at > now() - interval '30 days'
GROUP BY user_id
ORDER BY api_operations DESC
LIMIT 20;

-- Keys by provider
SELECT 
  provider,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM user_api_keys
GROUP BY provider
ORDER BY count DESC;
```

---

## Database Maintenance

### Weekly Tasks

```sql
-- Analyze query plans
ANALYZE;

-- Vacuum database
VACUUM;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index bloat
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_size,
  pg_size_pretty(idx_size) as idx_size_pretty
FROM pg_stat_user_indexes
ORDER BY idx_size DESC;
```

### Monthly Tasks

```sql
-- Rebuild indexes
REINDEX INDEX CONCURRENTLY idx_user_api_keys_user_id;
REINDEX INDEX CONCURRENTLY idx_audit_log_user_id;

-- Clean up old audit logs (keep 90 days)
DELETE FROM audit_log
WHERE created_at < now() - interval '90 days';

-- Full database statistics
SELECT 
  schemaname,
  COUNT(*) as table_count,
  SUM(n_live_tup) as total_rows,
  SUM(n_dead_tup) as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
GROUP BY schemaname;
```

---

## Performance Optimization

### Connection Pool Settings

**Current:** Default Supabase settings

**Monitor:**
```sql
-- Active connections
SELECT 
  datname,
  count(*) as connections
FROM pg_stat_activity
GROUP BY datname;

-- Long-running queries
SELECT 
  query_start,
  state_change,
  query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;
```

### Query Optimization

```sql
-- Find missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND correlation < 0.1
  AND n_distinct > 1000;

-- Check sequential scans
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;
```

---

## Uptime Tracking

### Status Page

Create a public status page using:
- Statuspage.io
- Upstatus.com
- Custom solution

**Display:**
- System uptime percentage
- Recent incidents
- Scheduled maintenance
- Component status

### Calculate Uptime

```javascript
const calculateUptime = (startDate, totalDowntime) => {
  const totalTime = Date.now() - startDate;
  const uptime = ((totalTime - totalDowntime) / totalTime) * 100;
  return uptime.toFixed(2) + '%';
};

// Example: 99.9% uptime target
// Acceptable downtime per month: ~43 minutes
```

---

## Incident Response Runbook

### Step 1: Detection (Automated)
- Health check fails
- Error rate spike detected
- Performance degradation alert

### Step 2: Assessment (5 minutes)
- [ ] Check Supabase status page
- [ ] Review recent logs
- [ ] Check application metrics
- [ ] Assess user impact

### Step 3: Communication (Immediate)
- [ ] Post to status page
- [ ] Notify team in Slack
- [ ] Determine severity level
- [ ] Assign incident lead

### Step 4: Mitigation (Varies)
- [ ] Scale up resources if needed
- [ ] Disable non-critical features
- [ ] Switch to read-only mode
- [ ] Failover if available

### Step 5: Recovery (Ongoing)
- [ ] Implement fix
- [ ] Roll out carefully
- [ ] Monitor for side effects
- [ ] Update status page

### Step 6: Post-Incident
- [ ] Document root cause
- [ ] Schedule retrospective
- [ ] Implement preventive measures
- [ ] Update runbook

---

## Alerting Rules

### Recommended Email/Slack Alerts

```
1. Health Check Status
   - Alert if status = error
   - Alert if any component down 5+ minutes

2. Error Rate
   - Alert if error rate > 1%
   - Alert if 10+ errors in 5 minutes

3. Performance
   - Alert if avg latency > 500ms
   - Alert if P99 latency > 2000ms

4. Disk Usage
   - Alert if > 80% capacity
   - Alert if > 90% capacity (critical)

5. Security
   - Alert on failed auth attempts (> 10 per minute)
   - Alert on unusual audit log activity

6. Backups
   - Alert if daily backup fails
   - Alert if backup > 24 hours old
```

---

## Dashboard Setup

### Grafana / Datadog / New Relic

Key Panels:
```
- Health Check Status (current)
- Database Latency (last 24h)
- Error Rate (last 24h)
- Edge Function Performance (last 24h)
- Audit Log Events (last 24h)
- API Key Usage (last 7d)
- User Signups (last 7d)
```

---

## Schedule

| Task | Frequency | Owner |
|------|-----------|-------|
| Check health endpoint | Every 5 min | Automated |
| Review error logs | Daily | Team |
| Run performance analysis | Weekly | DBA |
| Database maintenance | Monthly | DBA |
| Security audit | Quarterly | Security Lead |
| Incident retrospective | As needed | On-call |

---

**Last Updated:** 2026-03-21  
**Version:** 1.0
