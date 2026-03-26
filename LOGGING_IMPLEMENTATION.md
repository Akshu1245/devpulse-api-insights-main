# Structured Logging Implementation

## Overview

Production-grade structured logging added using **Winston** for observability and debugging.

---

## Features Implemented

### 1. **Request Logging**
- Logs all incoming HTTP requests with:
  - Request ID (unique per request)
  - HTTP method
  - Path
  - IP address
  - User agent
  - Response status code
  - Request duration

### 2. **Scan Execution Logging**
- Logs security scan lifecycle:
  - Scan request received (user_id, endpoint, method)
  - Scan validation failures
  - Scan execution start
  - Scan completion (risk level, vulnerabilities found)
  - Database storage confirmation
  - Vulnerability count

### 3. **Alert Logging**
- Logs alert pipeline:
  - Alert creation (user, severity, endpoint)
  - Database storage
  - Notification attempts (Slack/Email)
  - Success/failure for each notification channel

### 4. **Error Logging**
- All errors logged with:
  - Endpoint path
  - Error message
  - Stack trace (when available)
  - Request context (user_id, endpoint, etc.)

---

## Log Levels

- **info**: Normal operations (requests, scans, alerts)
- **warn**: Validation failures, high-severity findings
- **error**: Failures, exceptions, notification errors

---

## Log Outputs

### Console (Development)
- Colorized, human-readable format
- Shows timestamp, level, message, and metadata

### Files (Production)
- `logs/combined.log` - All logs (JSON format)
- `logs/error.log` - Errors only (JSON format)

---

## Configuration

`.env`:
```env
LOG_LEVEL="info"  # debug | info | warn | error
```

---

## Example Log Entries

### Request Log
```json
{
  "timestamp": "2026-03-26T18:30:00.000Z",
  "level": "info",
  "message": "Request started",
  "service": "devpulse-backend",
  "requestId": "1711476600000-abc123",
  "method": "POST",
  "path": "/scan",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0..."
}
```

### Scan Execution Log
```json
{
  "timestamp": "2026-03-26T18:30:01.500Z",
  "level": "info",
  "message": "Security scan completed",
  "service": "devpulse-backend",
  "user_id": "user_123",
  "endpoint": "https://api.example.com/users",
  "riskLevel": "HIGH",
  "vulnerabilitiesFound": 3
}
```

### Alert Log
```json
{
  "timestamp": "2026-03-26T18:30:02.000Z",
  "level": "info",
  "message": "Slack alert sent successfully",
  "service": "devpulse-backend",
  "severity": "HIGH",
  "endpoint": "https://api.example.com/users"
}
```

### Error Log
```json
{
  "timestamp": "2026-03-26T18:30:05.000Z",
  "level": "error",
  "message": "Scan execution failed",
  "service": "devpulse-backend",
  "user_id": "user_123",
  "endpoint": "https://api.invalid.com",
  "error": "fetch failed",
  "stack": "Error: fetch failed\n    at ..."
}
```

---

## Production Deployment

### 1. Create logs directory
```bash
mkdir -p logs
```

### 2. Set log level
```bash
echo 'LOG_LEVEL="info"' >> .env
```

### 3. Log rotation (recommended)
Use `logrotate` or similar:
```
/path/to/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 node node
    sharedscripts
}
```

---

## Metrics Available from Logs

Query logs to extract:
- **Request volume**: Count requests per endpoint
- **Error rates**: Count errors per endpoint
- **Scan performance**: Average scan duration
- **Alert frequency**: Count alerts by severity
- **Notification success rate**: Slack/Email delivery

Example (using `jq`):
```bash
# Count scans by risk level
cat logs/combined.log | jq -r 'select(.message == "Security scan completed") | .riskLevel' | sort | uniq -c

# Average request duration
cat logs/combined.log | jq -r 'select(.message == "Request completed") | .duration' | sed 's/ms//' | awk '{sum+=$1; count++} END {print sum/count "ms"}'
```

---

## Files Modified

1. `server/server.ts`
   - Added Winston logger setup
   - Added request logging middleware
   - Replaced all `console.error` with `logger.error`
   - Replaced all `console.log` with `logger.info`
   - Added scan execution logging
   - Added alert logging

2. `.env.example`
   - Added `LOG_LEVEL` configuration

3. `.gitignore`
   - Added `logs/` directory

4. `package.json`
   - Added `winston` dependency

---

## Benefits

✅ **Debugging**: Trace requests end-to-end with request IDs
✅ **Monitoring**: Track scan execution and alert delivery
✅ **Compliance**: Audit trail for security scans
✅ **Performance**: Measure request duration and identify slow endpoints
✅ **Alerts**: Monitor notification delivery success rates
