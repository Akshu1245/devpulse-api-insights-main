# DevPulse Production Hardening Guide

## Security & Reliability Checklist

### API Security

- [ ] **HTTPS/TLS Enforcement**
  ```python
  # Force HTTPS redirect
  app.add_middleware(HTTPSRedirectMiddleware)
  
  # Set security headers
  app.add_middleware(TrustedHostMiddleware, allowed_hosts=["yourdomain.com"])
  ```

- [ ] **CORS Configuration**
  ```python
  from fastapi.middleware.cors import CORSMiddleware
  
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["https://yourdomain.com"],
      allow_credentials=True,
      allow_methods=["GET", "POST"],
      allow_headers=["Authorization", "Content-Type"],
  )
  ```

- [ ] **Rate Limiting**
  ```python
  from slowapi import Limiter
  
  limiter = Limiter(key_func=get_remote_address)
  app.state.limiter = limiter
  
  @app.get("/api/endpoints")
  @limiter.limit("1000/minute")
  async def list_endpoints(request: Request):
      return endpoints
  ```

- [ ] **JWT Token Management**
  ```python
  JWT_ALGORITHM = "HS256"
  JWT_EXPIRATION_HOURS = 24
  JWT_REFRESH_EXPIRATION_DAYS = 30
  
  # Verify token signature and expiration
  def verify_token(token: str) -> dict:
      try:
          payload = jwt.decode(
              token,
              os.getenv("JWT_SECRET"),
              algorithms=[JWT_ALGORITHM]
          )
          if payload["exp"] < datetime.utcnow().timestamp():
              raise HTTPException(status_code=401, detail="Token expired")
          return payload
      except jwt.InvalidTokenError:
          raise HTTPException(status_code=401, detail="Invalid token")
  ```

- [ ] **Input Validation**
  ```python
  from pydantic import BaseModel, Field, validator
  
  class ScanRequest(BaseModel):
      endpoint_url: str = Field(..., max_length=2048)
      method: str = Field(..., regex="^(GET|POST|PUT|DELETE|PATCH)$")
      payload: Optional[str] = Field(None, max_length=1000000)
      
      @validator("endpoint_url")
      def validate_url(cls, v):
          if not v.startswith(("http://", "https://")):
              raise ValueError("Invalid URL")
          return v
  ```

- [ ] **SQL Injection Prevention**
  ```python
  # Use parameterized queries (already done with SQLAlchemy)
  query = db.query(Endpoint).filter(Endpoint.id == endpoint_id)
  
  # NEVER do string concatenation
  # query = db.execute(f"SELECT * FROM endpoints WHERE id = {endpoint_id}")
  ```

### Database Security

- [ ] **Row-Level Security (RLS)**
  ```sql
  ALTER TABLE endpoints ENABLE ROW LEVEL SECURITY;
  
  CREATE POLICY endpoints_isolation ON endpoints
  FOR ALL USING (auth.uid() = user_id);
  ```

- [ ] **Encryption at Rest**
  ```sql
  -- PostgreSQL encryption
  CREATE EXTENSION pgcrypto;
  
  ALTER TABLE endpoints
  ADD COLUMN payload_encrypted bytea;
  
  UPDATE endpoints SET payload_encrypted = pgp_sym_encrypt(
      payload::text, 'encryption-key'
  );
  ```

- [ ] **Encryption in Transit**
  ```python
  # Use connection string with sslmode
  DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require"
  ```

- [ ] **Database Backups**
  ```bash
  # Daily automated backups
  0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/db-$(date +\%Y\%m\%d).sql.gz
  
  # Retention: Keep 30 days
  find /backups -name "db-*.sql.gz" -mtime +30 -delete
  ```

- [ ] **Access Control**
  ```sql
  -- Create read-only user for analytics
  CREATE ROLE analytics_user WITH LOGIN ENCRYPTED PASSWORD 'password';
  GRANT USAGE ON SCHEMA public TO analytics_user;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
  
  -- Create limited service user
  CREATE ROLE service_user WITH LOGIN ENCRYPTED PASSWORD 'password';
  GRANT SELECT, INSERT, UPDATE ON endpoints TO service_user;
  ```

### Application Security

- [ ] **Environment Variable Security**
  ```bash
  # Use .env.production with restricted permissions
  chmod 600 .env.production
  
  # Never commit secrets
  echo ".env.production" >> .gitignore
  
  # Use secrets manager in production
  # AWS Secrets Manager, HashiCorp Vault, etc.
  ```

- [ ] **Dependency Scanning**
  ```bash
  # Check for vulnerabilities
  pip-audit
  safety check
  
  # Update regularly
  pip list --outdated
  ```

- [ ] **Secure Headers**
  ```python
  app.add_middleware(
      BaseHTTPMiddleware,
      dispatch=add_security_headers
  )
  
  def add_security_headers(request, call_next):
      response = await call_next(request)
      response.headers["X-Content-Type-Options"] = "nosniff"
      response.headers["X-Frame-Options"] = "DENY"
      response.headers["X-XSS-Protection"] = "1; mode=block"
      response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
      response.headers["Content-Security-Policy"] = "default-src 'self'"
      return response
  ```

- [ ] **Audit Logging**
  ```python
  # Log all security-relevant events
  def audit_log(action, user_id, details):
      db.add(AuditLog(
          action=action,
          user_id=user_id,
          details=details,
          timestamp=datetime.utcnow(),
          ip_address=request.client.host,
          user_agent=request.headers.get("user-agent")
      ))
      db.commit()
  
  # Called on:
  # - User login/logout
  # - Data access
  # - Configuration changes
  # - Permission changes
  ```

### Infrastructure Security

- [ ] **Firewall Rules**
  ```
  Ingress:
  - Port 443 (HTTPS) from anywhere
  - Port 22 (SSH) from admin IPs only
  - Internal: 5432 (PostgreSQL) from app only
  - Internal: 6379 (Redis) from app only
  
  Egress:
  - Allow all outbound for Supabase/external APIs
  - Restrict unnecessary services
  ```

- [ ] **Network Segmentation**
  ```
  Public Subnet:
  - Load Balancer (0.0.0.0:443)
  
  Private Subnet:
  - FastAPI Backend (10.0.1.x)
  - PostgreSQL (10.0.2.x)
  - Redis (10.0.3.x)
  ```

- [ ] **Container Security**
  ```dockerfile
  # Non-root user
  RUN useradd -m -u 1000 devpulse
  USER devpulse
  
  # Read-only filesystem (where possible)
  RUN chmod 555 /app
  
  # No privileged containers
  # Set security context in docker-compose
  security_opt:
    - no-new-privileges:true
  ```

- [ ] **Secrets Management**
  ```bash
  # Kubernetes secrets
  kubectl create secret generic devpulse-secrets \
    --from-literal=database_url=$DB_URL \
    --from-literal=jwt_secret=$JWT_SECRET
  
  # Docker secrets (Docker Swarm)
  echo $JWT_SECRET | docker secret create jwt_secret -
  
  # Vault integration
  vault kv get secret/devpulse/production
  ```

- [ ] **SSL/TLS Certificates**
  ```bash
  # Use Let's Encrypt with auto-renewal
  # nginx-certbot or certbot standalone
  
  certbot certonly --standalone \
    -d yourdomain.com \
    --agree-tos \
    --email admin@yourdomain.com
  
  # Auto-renew
  0 12 * * * certbot renew --quiet
  ```

### Monitoring & Detection

- [ ] **Intrusion Detection**
  ```yaml
  # Alert on suspicious patterns
  - alert: UnusualAPIActivity
    expr: rate(devpulse_request_errors_total[5m]) > 10
    annotations:
      summary: "Possible intrusion attempt detected"
  
  - alert: PrivilegeEscalation
    expr: audit_log_action{action="permission_granted"} > 5 in 5m
    annotations:
      summary: "Multiple privilege grants detected"
  ```

- [ ] **DDoS Protection**
  ```
  - Use Cloudflare or AWS Shield
  - Configure rate limiting (1000 req/min per IP)
  - Set up WAF rules
  - Enable auto-scaling for traffic spikes
  ```

- [ ] **Security Scanning**
  ```bash
  # OWASP ZAP scanning
  docker run -t owasp/zap2docker-stable zap-baseline.py \
    -t http://localhost:8000/api
  
  # Static code analysis
  pip install bandit
  bandit -r backend/
  ```

- [ ] **Vulnerability Management**
  ```bash
  # Regular scanning
  grype . --output table
  
  # Dependency updates
  pip install --upgrade -r backend/requirements.txt
  npm audit fix
  ```

### Compliance

- [ ] **GDPR Compliance**
  ```python
  # Right to be forgotten
  @app.delete("/api/users/{user_id}")
  def delete_user_data(user_id: str, current_user = Depends(get_current_user)):
      # Delete all user data
      db.query(Endpoint).filter(Endpoint.user_id == user_id).delete()
      db.query(ShadowApiDiscovery).filter(ShadowApiDiscovery.user_id == user_id).delete()
      db.query(ComplianceViolation).filter(ComplianceViolation.user_id == user_id).delete()
      db.commit()
  
  # Data export
  @app.get("/api/users/{user_id}/export")
  def export_user_data(user_id: str):
      endpoints = db.query(Endpoint).filter(Endpoint.user_id == user_id).all()
      return {"data": endpoints}
  ```

- [ ] **SOC 2 Compliance**
  ```
  - Audit logging ✓
  - Access controls ✓
  - Encryption ✓
  - Backup strategy ✓
  - Incident response plan ✓
  - Annual security assessment ✓
  ```

- [ ] **Data Residency**
  ```
  # Ensure data stays in required region
  - Deploy in specific AWS region
  - Configure Supabase region
  - Document data flow
  ```

### Incident Response

- [ ] **Incident Response Plan**
  ```
  1. Detection: Alert triggered
  2. Assessment: Severity evaluation
  3. Containment: Isolate affected systems
  4. Eradication: Remove threat
  5. Recovery: Restore to clean state
  6. Post-mortem: Document and improve
  ```

- [ ] **Emergency Access**
  ```bash
  # Break-glass account for emergency access
  # Stored securely (separate from normal operations)
  # Used only with full audit trail
  # Requires 2 approvals
  ```

- [ ] **Communication Plan**
  ```
  On-call rotation: ops-team@company.com
  Incident channel: #devpulse-security
  Status page: status.devpulse.io
  
  Notification escalation:
  1. Slack (automatic)
  2. PagerDuty (on-call)
  3. Phone call (critical)
  4. Customer notification (if needed)
  ```

---

## Production Deployment Checklist

### Security Review
- [ ] OWASP Top 10 assessment completed
- [ ] Penetration testing scheduled
- [ ] Security headers validated
- [ ] SSL/TLS configuration verified
- [ ] Rate limiting configured
- [ ] Input validation implemented
- [ ] SQL injection prevention confirmed
- [ ] XSS protection enabled
- [ ] CSRF tokens implemented

### Compliance Review
- [ ] GDPR requirements met
- [ ] SOC 2 controls implemented
- [ ] Data residency confirmed
- [ ] Audit logging enabled
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] Data processing agreements in place

### Infrastructure Review
- [ ] Firewall rules configured
- [ ] Network segmentation in place
- [ ] SSL certificates installed
- [ ] Backups tested and verified
- [ ] Disaster recovery plan documented
- [ ] Load balancer configured
- [ ] Auto-scaling enabled
- [ ] Monitoring and alerting operational

### Application Review
- [ ] Dependencies audited
- [ ] Secrets not in code
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Performance tested under load
- [ ] Database migrations verified
- [ ] Cache strategy implemented
- [ ] Circuit breakers installed

### Operations Review
- [ ] On-call rotation established
- [ ] Runbooks created
- [ ] Incident response plan documented
- [ ] Status page configured
- [ ] Documentation updated
- [ ] Team training completed
- [ ] Change management process defined
- [ ] Rollback procedure tested

---

## Regular Security Maintenance

### Weekly
- [ ] Review security logs
- [ ] Check for failed authentication attempts
- [ ] Verify backup completion
- [ ] Review error logs for patterns

### Monthly
- [ ] Dependency vulnerability scan
- [ ] Access control review
- [ ] Audit log review
- [ ] Capacity planning review
- [ ] Performance analysis

### Quarterly
- [ ] Penetration testing
- [ ] Security assessment
- [ ] Disaster recovery drill
- [ ] Compliance audit
- [ ] Architecture review

### Annually
- [ ] Full security audit
- [ ] SOC 2 recertification
- [ ] Team security training
- [ ] Policy updates
- [ ] Incident retrospective

---

**Security**: Production-grade hardening with encryption, access control, audit logging, and compliance.
