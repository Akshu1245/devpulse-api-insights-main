# Backup & Recovery Procedures

## Backup Strategy

### Automatic Backups (Supabase)

Supabase provides automatic daily backups at no extra cost in paid plans.

**Backup Details:**
- Frequency: Daily
- Retention: 7 days (free), 30 days (pro+)
- Location: Supabase managed infrastructure
- Access: Supabase Dashboard > Settings > Backups

### Manual Backups (Recommended)

Export your database weekly for off-site storage.

#### Method 1: Export via Dashboard

```
1. Go to Supabase Dashboard
2. Click "Database" → "Backups"
3. Click "Request a backup"
4. Download .sql file when ready
5. Store in secure location (AWS S3, Google Drive, local)
```

#### Method 2: pg_dump via CLI

```bash
# Set up environment
export PGPASSWORD="your_password"

# Full database dump
pg_dump -h your_db_host -U postgres -d postgres > backup_$(date +%Y%m%d).sql

# Tables only (exclude data)
pg_dump -h your_db_host -U postgres -d postgres -s > schema_$(date +%Y%m%d).sql

# Specific tables
pg_dump -h your_db_host -U postgres -d postgres -t user_api_keys > keys_backup.sql
```

#### Method 3: Automated Backup Script

```bash
#!/bin/bash
# backup.sh - Run daily via cron

BACKUP_DIR="/backups/devpulse"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
pg_dump -h $DB_HOST -U postgres -d postgres > $BACKUP_DIR/backup_$DATE.sql

# Compress
gzip $BACKUP_DIR/backup_$DATE.sql

# Upload to S3
aws s3 cp $BACKUP_DIR/backup_$DATE.sql.gz s3://my-backups/devpulse/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

---

## Recovery Procedures

### Scenario 1: Restore Latest Backup

```sql
-- In Supabase dashboard SQL Editor

-- 1. Drop current schema (CAREFUL!)
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- 2. Restore from backup file
-- Use dashboard UI: Database > Restore

-- Or via psql:
psql -U postgres -d postgres < backup_20260321.sql
```

### Scenario 2: Point-in-Time Recovery

**For Supabase Pro+:**
```
1. Dashboard > Settings > Backups
2. Select desired date/time
3. Click "Restore" 
4. Choose new project or overwrite
5. Verify data integrity
```

### Scenario 3: Selective Recovery

Restore only specific tables:

```bash
# Extract specific table from backup
pg_dump -h localhost -U postgres -d postgres -t user_api_keys > keys_only.sql

# Restore to current database
psql -U postgres -d postgres < keys_only.sql
```

### Scenario 4: Copy Data Between Projects

```bash
# Backup from source
pg_dump -h source_host -U postgres -d postgres > full_backup.sql

# Restore to target
psql -h target_host -U postgres -d postgres < full_backup.sql

# Or stream directly
pg_dump -h source_host -U postgres -d postgres | psql -h target_host -U postgres -d postgres
```

---

## Critical Data Protection

### Encryption Keys Backup

**NEVER commit KEY_ENCRYPTION_SECRET to git**

Backup procedure:
```bash
# 1. Store in secure password manager
# 2. Save printed copy in company safe
# 3. Store encrypted copy in S3

# Encrypt and upload
echo "KEY_ENCRYPTION_SECRET=your_secret" | gpg --encrypt > key.gpg
aws s3 cp key.gpg s3://my-backups/secrets/

# Decrypt when needed
aws s3 cp s3://my-backups/secrets/key.gpg - | gpg --decrypt
```

### API Keys & Secrets Recovery

Encrypted API keys are stored in `user_api_keys` table. They're safe to back up.

```sql
-- List all encrypted keys (NO decryption, safe to export)
SELECT id, user_id, provider, key_alias, created_at 
FROM user_api_keys 
ORDER BY created_at DESC;
```

---

## Disaster Recovery Plan

### Communications (First 5 minutes)

```
1. Identify the issue
2. Notify team via Slack
3. Create incident ticket
4. Assign incident lead
5. Start incident channel
```

### Assessment (Next 15 minutes)

```
[ ] Determine scope of data loss
[ ] Check Supabase status page
[ ] Check application logs
[ ] Verify backup integrity
[ ] Estimate recovery time
```

### Recovery (Depends on scenario)

#### Minor Data Corruption (< 1 hour)
```
1. Identify affected records
2. Use point-in-time recovery if available
3. Or restore from daily backup
4. Verify data integrity
5. Resume normal operations
```

#### Major Outage (> 1 hour)
```
1. Activate disaster recovery plan
2. Switch to backup Supabase project (if available)
3. Restore latest backup
4. Update DNS/CDN to point to recovery environment
5. Verify all systems operational
6. Run post-deployment verification
7. Monitor for issues
```

#### Data Loss (Worst Case)
```
1. Restore from oldest available backup
2. Identify missing data window
3. Notify users of data loss
4. Implement stronger backup strategy
5. Review root cause
6. Implement preventive measures
```

---

## Verification & Testing

### Monthly Backup Test

```bash
# Schedule: First Monday of each month

# 1. Download latest backup
# 2. Restore to test project
# 3. Run verification queries
# 4. Test critical features
# 5. Document backup integrity
# 6. Clean up test project
```

### Verification Checklist

```sql
-- Test queries to verify backup health

-- Count records
SELECT count(*) as profiles_count FROM profiles;
SELECT count(*) as agents_count FROM agents;
SELECT count(*) as user_api_keys_count FROM user_api_keys;
SELECT count(*) as audit_log_count FROM audit_log;

-- Verify RLS policies
SELECT schemaname, tablename FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true;

-- Check indexes
SELECT schemaname, tablename, indexname FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;

-- Verify triggers
SELECT trigger_schema, trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers 
WHERE trigger_schema = 'public';
```

---

## Backup Retention Policy

### Database Backups
- **Daily**: Keep 7 days (auto)
- **Weekly**: Keep 4 weeks (manual)
- **Monthly**: Keep 12 months (manual)
- **Yearly**: Keep indefinitely (archive)

### Configuration Backups
- Store in git (separate private repo)
- Exclude secrets and credentials
- Tag major releases

### Logs
- Keep 30 days in Supabase
- Export to S3 for long-term storage

---

## Recovery Time Objectives (RTO)

| Scenario | RTO | Recovery Method |
|----------|-----|-----------------|
| Minor data corruption | 1 hour | Point-in-time restore |
| Table corruption | 2 hours | Selective table restore |
| Project failure | 4 hours | Full database restore |
| Regional outage | 8 hours | Failover to new region |
| Complete data loss | TBD | From oldest backup |

---

## Post-Recovery Steps

After any recovery:

```
1. [ ] Run post-deployment verification
2. [ ] Check all functions are operational
3. [ ] Verify audit logs are working
4. [ ] Test user authentication
5. [ ] Verify API keys still decrypt correctly
6. [ ] Check health check endpoint
7. [ ] Monitor error logs for 24 hours
8. [ ] Document incident and recovery
9. [ ] Post incident review meeting
10. [ ] Implement preventive measures
```

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| On-Call Engineer | [TBD] | | |
| Team Lead | [TBD] | | |
| Security Lead | [TBD] | | |
| Supabase Support | | | support@supabase.io |

---

## Tools & Resources

- **Supabase CLI**: `supabase db pull` / `supabase db push`
- **pg_dump**: PostgreSQL native backup tool
- **pgRestore**: PostgreSQL native restore tool
- **AWS S3**: Off-site backup storage
- **HashiCorp Vault**: Secrets management (optional)

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-21 | 1.0 | Initial backup procedures |

---

**IMPORTANT**: Test recovery procedures quarterly. Don't wait for an emergency to discover problems!
