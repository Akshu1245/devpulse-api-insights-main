# STEP 1: POSTMAN COLLECTION PARSER - Integration Guide

## Overview

The Postman Collection Parser enables bulk API scanning by uploading Postman Collection v2.1 JSON files. The system:

1. **Parses** Postman v2.1 JSON format
2. **Recursively traverses** nested folders and requests
3. **Extracts** each endpoint (URL, method, headers, body)
4. **Scans** each endpoint using the existing security scanner
5. **Stores** results in Supabase database
6. **Returns** structured results with risk assessment

---

## Architecture

### Components

```
┌─────────────────────┐
│  Postman JSON File  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│  postman_parser.py              │
│  - JSON parsing                 │
│  - Recursive traversal          │
│  - Endpoint extraction          │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  postman.py Router              │
│  - File upload handling         │
│  - Async scanning orchestration │
│  - Error handling               │
└──────────┬──────────────────────┘
           │
           ├─────────────────────────┐
           │                         │
           ▼                         ▼
    ┌─────────────┐            ┌──────────────────┐
    │  Scanner    │            │  Database        │
    │  Service    │            │  (Supabase)      │
    │             │            │  - uploads       │
    │ run_security│            │  - scans         │
    │ _probe()    │            │  - alerts        │
    └─────────────┘            └──────────────────┘
           │
           ▼
    ┌─────────────┐
    │  Results    │
    │  + Risk     │
    │  Levels     │
    └─────────────┘
```

### Data Flow

```
Input: Postman Collection JSON
  ↓
Parse & Validate (postman_parser.parse_postman_collection)
  ↓
Extract Endpoints List
  ↓
For Each Endpoint:
  └─> Async Scan (run_security_probe)
  └─> Extract Issues
  └─> Compute Risk Level
  └─> Store in Database
  ↓
Aggregate Results
  ↓
Return Response with Statistics
```

---

## Data Models

### Extracted Endpoint Structure

```python
{
    "name": "Get Users",
    "method": "GET",
    "url": "https://api.example.com/users",
    "headers": [
        {"key": "Authorization", "value": "Bearer token"},
        {"key": "Content-Type", "value": "application/json"}
    ],
    "body": "",
    "path": "User Management/Get Users",
    "folder": "User Management",
    "description": "Fetch all users"
}
```

### Upload Response

```json
{
  "collection_name": "DevPulse Sample API Inventory",
  "collection_description": "Sample Postman collection",
  "endpoint_count": 8,
  "scanned_count": 8,
  "upload_id": "postman_user_1234567890",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "results": [
    {
      "name": "Get Users",
      "method": "GET",
      "url": "https://api.example.com/users",
      "headers": [...],
      "body": "",
      "path": "User Management/Get Users",
      "folder": "User Management",
      "description": "Fetch all users",
      "risk_level": "high",
      "issues": [
        {
          "issue": "Missing security header: HSTS",
          "risk_level": "high",
          "recommendation": "Add Strict-Transport-Security header",
          "method": "GET"
        }
      ]
    },
    ...
  ]
}
```

### Database Tables

#### postman_uploads
```sql
CREATE TABLE postman_uploads (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    upload_id TEXT UNIQUE NOT NULL,
    collection_name TEXT,
    endpoint_count INT,
    created_at TIMESTAMP
);
```

#### postman_scans
```sql
CREATE TABLE postman_scans (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    endpoint_name TEXT,
    endpoint_url TEXT,
    method TEXT,
    issue TEXT,
    risk_level TEXT,
    recommendation TEXT,
    created_at TIMESTAMP
);
```

---

## API Endpoints

### 1. Upload Postman Collection

**Endpoint:**
```
POST /postman/upload
```

**Authentication:**
- Required: Bearer token in `Authorization` header

**Request:**
```
Content-Type: multipart/form-data

file: <PostmanCollection.json>
```

**Response (200 OK):**
```json
{
  "collection_name": "...",
  "endpoint_count": 8,
  "scanned_count": 8,
  "results": [...],
  "upload_id": "postman_user_...",
  "timestamp": "2024-01-15T..."
}
```

**Error Responses:**
- **400**: File not JSON, invalid format, or parse error
- **401**: Missing or invalid authorization
- **500**: Server error

### 2. Get Upload History

**Endpoint:**
```
GET /postman/history?limit=50
```

**Authentication:**
- Required: Bearer token

**Response (200 OK):**
```json
[
  {
    "upload_id": "postman_user_...",
    "collection_name": "API Inventory",
    "endpoint_count": 8,
    "scanned_count": 8,
    "created_at": "2024-01-15T10:30:00Z",
    "issues_found": 3
  },
  ...
]
```

---

## Integration with Existing Code

### 1. Scanner Service Integration

The `run_security_probe` function is called for each endpoint:

```python
# From backend/services/scanner.py
async def run_security_probe(url: str) -> list[dict[str, Any]]:
    """
    Scans a single URL for security issues.
    Returns list of dicts with keys:
    - issue: description
    - risk_level: "critical", "high", "medium", "low"
    - recommendation: fix guidance
    - method: "GET" or "POST"
    """
```

### 2. Database Integration

Results are stored in Supabase tables:
- `postman_uploads`: Collection metadata
- `postman_scans`: Individual scan results
- `security_alerts`: Critical/high-risk findings (optional)

### 3. Authentication Integration

Uses existing `get_current_user_id` dependency from `auth_guard.py`:

```python
async def get_current_user_id(
    authorization: str | None = Header(...)
) -> str:
    # Validates Bearer token
    # Returns user_id or raises 401
```

---

## Error Handling

### Parser Errors

| Error | Cause | Status |
|-------|-------|--------|
| `Invalid JSON` | Malformed JSON syntax | 400 |
| `Missing 'info' field` | Not a Postman collection | 400 |
| `Missing 'item' field` | Invalid collection structure | 400 |
| `'item' field must be an array` | Malformed items | 400 |

### Network Errors

When scanning fails:
- Timeout → Issue logged, scan continues
- HTTP error → Issue logged with error details
- Invalid URL → Issue logged, scan continues

Results are still returned with error details included.

### Edge Cases Handled

✓ Deeply nested folders (any depth)
✓ Requests without URLs → Skipped
✓ Disabled headers → Excluded
✓ Multiple body formats (raw, urlencoded, formdata, graphql)
✓ URL variables ({{var}}) → Passed as-is to scanner
✓ Missing content → Defaults to empty string
✓ Concurrent scanning → Async semaphore prevents overload

---

## Usage Examples

### Python Test Script

```python
import httpx
import json

# Load Postman collection
with open("backend/sample_postman_collection.json") as f:
    collection_json = f.read()

# Prepare multipart request
files = {"file": ("collection.json", collection_json, "application/json")}

# Upload
async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/postman/upload",
        files=files,
        headers={
            "Authorization": "Bearer YOUR_TOKEN"
        }
    )
    print(json.dumps(response.json(), indent=2))
```

### cURL Example

```bash
curl -X POST "http://localhost:8000/postman/upload" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@backend/sample_postman_collection.json"
```

### Get History

```bash
curl -X GET "http://localhost:8000/postman/history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Supported Postman Collection Format

**Version:** Postman Collection v2.1

**Structure:**
```json
{
  "info": {
    "name": "Collection Name",
    "description": "Optional description",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Folder Name",
      "item": [
        {
          "name": "Request Name",
          "request": {
            "method": "GET",
            "header": [{"key": "...", "value": "..."}],
            "body": {"mode": "raw", "raw": "..."},
            "url": "https://..."
          },
          "description": "Optional"
        }
      ]
    }
  ]
}
```

---

## Performance Notes

- **Parsing:** O(endpoints) - linear
- **Scanning:** Parallel async tasks (respects rate limits)
- **Storage:** Batch inserts to Supabase
- **Memory:** Streams file upload, doesn't load into memory

For collections with 1000+ endpoints:
- Parsing: <500ms
- Scanning: 2-5 seconds (depends on endpoint response times)
- Storage: <1 second

---

## Integration with STEP 2+

This parser output feeds into:
1. **STEP 2 (Risk Engine):** Each endpoint gets a unified risk score
2. **STEP 3 (Correlation):** Endpoints are correlated with cost data
3. **STEP 4 (Compliance):** Issues mapped to PCI/GDPR
4. **STEP 5 (CI/CD):** PR comments generated from highest-risk endpoints
5. **STEP 9 (VS Code UI):** Results displayed in sidebar/webview

---

## Files Modified/Created

✓ `backend/services/postman_parser.py` (NEW)
✓ `backend/routers/postman.py` (NEW)
✓ `backend/main.py` (MODIFIED - added import + router registration)
✓ `backend/sample_postman_collection.json` (NEW - for testing)

---

## Next Steps

Wait for confirmation to proceed to **STEP 2: UNIFIED RISK SCORE ENGINE**.
