# DevPulse API Insights - Complete Deployment Guide

## Table of Contents
1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Production Platforms](#production-platforms)
4. [Database Migrations](#database-migrations)
5. [Environment Configuration](#environment-configuration)
6. [Monitoring & Logging](#monitoring--logging)
7. [Scaling & Performance](#scaling--performance)
8. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 16+ (or use Docker)
- Redis 7+ (or use Docker)
- Supabase account with API keys
- VS Code with Extensions API

### Quick Start

```bash
# 1. Install backend dependencies
cd backend
pip install -r requirements.txt

# 2. Install frontend dependencies
cd ../
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Run database migrations
python -m alembic upgrade head  # Or: supabase migration up

# 5. Start backend development server
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 6. In another terminal, start frontend
npm run dev

# 7. In another terminal, build and test extension
cd vscode-extension
npm install
npm run build
npm run test
```

---

## Docker Deployment

### Local Docker Development

```bash
# Start full stack locally
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Clean up volumes (data loss)
docker-compose down -v
```

### Production Docker Build

```bash
# Build image
docker build -t devpulse-backend:latest .

# Tag for registry
docker tag devpulse-backend:latest ghcr.io/YOUR_ORG/devpulse-backend:latest

# Push to registry
docker push ghcr.io/YOUR_ORG/devpulse-backend:latest

# Deploy to Docker Swarm or Kubernetes
docker pull ghcr.io/YOUR_ORG/devpulse-backend:latest
docker run -d \
  --name devpulse-backend \
  -p 8000:8000 \
  -e DATABASE_URL="postgresql://..." \
  -e SUPABASE_URL="..." \
  -e SUPABASE_KEY="..." \
  ghcr.io/YOUR_ORG/devpulse-backend:latest
```

### Health Checks

```bash
# Backend health endpoint
curl http://localhost:8000/health

# Readiness probe (includes dependencies)
curl http://localhost:8000/ready

# Liveness probe
curl http://localhost:8000/live
```

---

## Production Platforms

### Railway.app Deployment

```bash
# 1. Create Railway project
railway init

# 2. Connect GitHub repo
# (Use GitHub workflow triggered by Railway plugin)

# 3. Add environment variables via Railway dashboard
# DATABASE_URL, SUPABASE_URL, SUPABASE_KEY, JWT_SECRET

# 4. Deploy
railway deploy
```

### Render.com Deployment

```bash
# 1. Connect GitHub repository
# Add render.yaml to root:

version: 1
services:
  - type: web
    name: devpulse-backend
    env: python
    buildCommand: pip install -r backend/requirements.txt
    startCommand: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        scope: build,run
        value: "postgresql://..."
      - key: SUPABASE_URL
        scope: build,run
        value: $SUPABASE_URL
      - key: SUPABASE_KEY
        scope: build,run
        value: $SUPABASE_KEY

# 2. Deploy via Render dashboard or CLI
# render deploy
```

### Vercel/Netlify (Serverless)

**Not recommended for FastAPI backend** (use serverless functions instead).
For frontend SPA with backend API:

```bash
# Deploy frontend to Vercel/Netlify
npm run build
# Vercel: vercel --prod
# Netlify: netlify deploy --prod --dir dist

# Configure API proxy to backend
# vercel.json or netlify.toml:
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "http://backend:8000/$1" }
  ]
}
```

### AWS Deployment (ECS/Fargate)

```bash
# 1. Push image to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker push $ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/devpulse-backend:latest

# 2. Create ECS cluster
aws ecs create-cluster --cluster-name devpulse-prod

# 3. Register task definition (ecs-task-definition.json)
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# 4. Create service
aws ecs create-service \
  --cluster devpulse-prod \
  --service-name devpulse-backend \
  --task-definition devpulse-backend:1 \
  --desired-count 3 \
  --launch-type FARGATE
```

### Kubernetes Deployment

```bash
# 1. Create deployment manifest
kubectl apply -f k8s/deployment.yaml

# 2. Create service
kubectl apply -f k8s/service.yaml

# 3. Configure ingress
kubectl apply -f k8s/ingress.yaml

# 4. Monitor deployment
kubectl get pods -n devpulse
kubectl logs -f deployment/devpulse-backend -n devpulse

# Scale on demand
kubectl scale deployment devpulse-backend --replicas=5 -n devpulse
```

See [k8s/README.md](k8s/README.md) for full Kubernetes setup.

---

## Database Migrations

### Running Migrations

```bash
# Auto-run on container startup
# (Migrations run from supabase/migrations/ directory)

# Manual migration
supabase migration up

# Or with psql directly
psql $DATABASE_URL -f supabase/migrations/001_init.sql
psql $DATABASE_URL -f supabase/migrations/002_endpoints.sql
# ... etc

# Check migration status
supabase migration list
```

### Migration Files

All migrations are in `supabase/migrations/`:
- `001_init.sql` - Supabase auth setup
- `002_endpoints.sql` - API endpoints table
- `003_risks_and_scores.sql` - Risk engine tables
- `004_correlations.sql` - Endpoint correlation
- `005_compliance.sql` - Compliance engine
- `006_ci_cd_integration.sql` - CI/CD tables
- `007_cost_anomaly.sql` - Cost detection
- `008_thinking_tokens.sql` - Token attribution
- `009_compliance_requirements.sql` - Compliance requirements
- `010_create_shadow_api_tables.sql` - Shadow API detection

### Creating New Migrations

```bash
# Generate migration file
supabase migration create add_new_table

# Edit the generated file in supabase/migrations/

# Test locally
docker-compose up postgres
supabase migration up

# Deploy to production
supabase migration push --linked
```

### Rollback Strategy

```bash
# 1. Identify last good migration
supabase migration list

# 2. Rollback (WARNING: Data loss possible)
# Edit migration file to add DOWN statements if not present

# 3. Reapply with fixes
supabase migration up

# OR create new migration to undo changes
# supabase migration create rollback_xxx
```

---

## Environment Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/devpulse
REDIS_URL=redis://:password@host:6379/0

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Authentication
JWT_SECRET=your-jwt-secret-key-min-32-chars

# Deployment
ENVIRONMENT=production
LOG_LEVEL=info
```

### Optional Environment Variables

```env
# Performance
WORKERS=4
TIMEOUT=120
MAX_REQUESTS=10000

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
MONITORING_ENABLED=true

# Features
ENABLE_SHADOW_API_DETECTION=true
ENABLE_COST_ANOMALY=true
ENABLE_COMPLIANCE_ENGINE=true

# Security
CORS_ORIGINS=https://yourdomain.com
SECURE_COOKIES=true
RATE_LIMIT_REQUESTS=1000
RATE_LIMIT_PERIOD=60
```

### Loading Environment Variables

```bash
# Create .env.production file locally
# Or set via platform UI/CLI:

# Docker
docker run -e DATABASE_URL="..." backend:latest

# Docker Compose
docker-compose -f docker-compose.yml up

# Kubernetes
kubectl create secret generic devpulse-env --from-file=.env -n devpulse

# Render/Railway/etc
# Use platform dashboard to set env vars
```

---

## Monitoring & Logging

### Built-in Health Endpoints

```bash
# Application health
GET /health

# Service readiness (includes deps check)
GET /ready

# Liveness probe (k8s/container orchestration)
GET /live

# Metrics for Prometheus
GET /metrics
```

### Structured Logging

All components log in JSON format for easy parsing:

```bash
# View logs
docker-compose logs -f backend

# Filter by level
docker-compose logs backend | grep "ERROR"

# Tail last 100 lines
docker-compose logs --tail=100 backend
```

### Monitoring Stack

#### Prometheus
- **URL**: http://localhost:9090
- **Scrapes**: Backend /metrics endpoint every 15s
- **Retention**: 30 days
- **Config**: [monitoring/prometheus.yml](monitoring/prometheus.yml)

#### Grafana
- **URL**: http://localhost:3000
- **Dashboards**: Pre-configured for API metrics, database, Redis
- **Alerts**: Configured for critical thresholds
- **Config**: [monitoring/grafana/provisioning](monitoring/grafana/provisioning)

#### Sentry (Error Tracking)
- **Setup**: `pip install sentry-sdk`
- **Integration**: FastAPI auto-captures errors
- **Configuration**:
  ```python
  import sentry_sdk
  sentry_sdk.init(
      dsn=os.getenv("SENTRY_DSN"),
      traces_sample_rate=0.1
  )
  ```

### Custom Metrics to Monitor

**Critical Metrics:**
- `devpulse_api_endpoints_total` - Total API endpoints scanned
- `devpulse_shadow_api_detections_total` - Shadow APIs detected
- `devpulse_risk_score_distribution` - Risk score histogram
- `devpulse_compliance_violations` - Compliance violations
- `devpulse_request_duration_seconds` - Request latency (histogram)
- `devpulse_database_query_duration_seconds` - Query latency

**Infrastructure Metrics:**
- `process_resident_memory_bytes` - Memory usage
- `process_cpu_seconds_total` - CPU usage
- `postgres_connections_used` - DB connections
- `redis_used_memory_bytes` - Redis memory

---

## Scaling & Performance

### Horizontal Scaling

```bash
# Docker Compose (not recommended for prod)
docker-compose up --scale backend=3

# Kubernetes
kubectl scale deployment devpulse-backend --replicas=5

# Load Balancer Setup
# Configure nginx/HAProxy/cloud LB to distribute traffic
```

### Database Connection Pooling

```python
# Already configured in backend
# PgBouncer or built-in connection pooling

DATABASE_URL=postgresql://user:pass@host/devpulse?sslmode=require&min_size=5&max_size=20
```

### Redis Caching

```python
# Cache expensive operations
# Implemented in backend/services/cache_service.py

# Strategy:
# - Cache risk scores (1 hour TTL)
# - Cache compliance mappings (24 hour TTL)
# - Cache endpoint list (5 minute TTL)
# - Cache user permissions (30 minute TTL)
```

### Query Optimization

**Materialized Views** (sub-2s refresh):
- `shadow_api_summary` - Aggregate shadow API data
- `anomaly_distribution` - Anomaly type breakdown
- `high_risk_endpoints` - Top 10 high-risk endpoints

**Indexes Created**:
- All foreign keys
- Risk score ranges
- Timestamp-based queries
- User-based filtering

```bash
# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM endpoints WHERE risk_score > 75;

# Auto-vacuum
ANALYZE endpoints;
REINDEX TABLE endpoints;
```

### Rate Limiting

```python
# Built-in: 1000 requests/second per API key
# Via middleware in backend/services/auth_guard.py

# Customize in backend config:
RATE_LIMIT_REQUESTS=1000
RATE_LIMIT_PERIOD=60  # seconds
```

---

## Troubleshooting

### Backend Not Starting

```bash
# 1. Check logs
docker logs devpulse-backend

# 2. Verify environment variables
docker exec devpulse-backend env | grep DATABASE_URL

# 3. Test database connection
docker exec devpulse-postgres psql -U postgres -c "SELECT 1;"

# 4. Check if port is in use
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# 5. Rebuild image
docker-compose down
docker-compose build --no-cache backend
docker-compose up backend
```

### Database Connection Issues

```bash
# 1. Verify DATABASE_URL format
# Should be: postgresql://user:password@host:port/database

# 2. Test connection directly
psql $DATABASE_URL -c "SELECT 1;"

# 3. Check Supabase credentials
curl https://your-project.supabase.co/rest/v1/ \
  -H "Authorization: Bearer your-key"

# 4. Check PostgreSQL is running
docker-compose logs postgres | tail -20
```

### Memory/CPU Issues

```bash
# Monitor resource usage
docker stats devpulse-backend

# If CPU high:
# - Reduce WORKERS in env
# - Scale horizontally with load balancer
# - Optimize slow queries (see Performance section)

# If memory high:
# - Reduce cache TTL in backend config
# - Increase Redis memory if using external Redis
# - Monitor for memory leaks with Grafana
```

### Slow API Responses

```bash
# 1. Check backend logs for slow queries
docker logs devpulse-backend | grep SLOW

# 2. Query database directly for performance
EXPLAIN ANALYZE SELECT * FROM shadow_api_discoveries LIMIT 100;

# 3. Restart PostgreSQL to clear cache
docker-compose restart postgres

# 4. Check indices are created
SELECT * FROM pg_indexes WHERE schemaname = 'public';
```

### VS Code Extension Not Connecting

```bash
# 1. Verify backend is running
curl http://localhost:8000/health

# 2. Check extension logs in VS Code
View → Output → DevPulse Extension

# 3. Verify API endpoint in extension config
Settings → DevPulse → API URL: http://backend:8000

# 4. Check authentication token is valid
# Token from: Settings → DevPulse → API Key
```

### Docker Compose Network Issues

```bash
# 1. Check service connectivity
docker-compose exec backend ping redis
docker-compose exec backend ping postgres

# 2. Inspect network
docker network inspect devpulse_devpulse

# 3. Rebuild network
docker-compose down
docker network prune
docker-compose up

# 4. Force network recreation
docker-compose --compatibility up -d
```

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Backend health endpoints verified
- [ ] Supabase credentials validated
- [ ] SSL/TLS certificates installed
- [ ] CORS configured for frontend domain
- [ ] Monitoring dashboard accessible
- [ ] Logging pipeline verified
- [ ] Backups scheduled
- [ ] Disaster recovery plan documented
- [ ] Rate limiting configured
- [ ] VS Code extension signed/notarized
- [ ] Load balancer configured
- [ ] DNS records updated
- [ ] SSL certificate monitoring enabled

## Support & Resources

- **Documentation**: [README.md](../README.md)
- **API Docs**: `http://localhost:8000/docs` (Swagger)
- **Issues**: [GitHub Issues](https://github.com/your-org/devpulse/issues)
- **Community**: Discussions tab in GitHub

---

**Last Updated**: March 2024
**Version**: 1.0.0
