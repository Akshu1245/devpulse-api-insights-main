# DevPulse Supabase Setup Script
# This script helps set up Supabase for the DevPulse project

$ErrorActionPreference = "Stop"

# Colors for output
$greenCheck = "[OK]"
$redX = "[ERR]"
$warningIcon = "[!]"
$infoIcon = "[*]"

function Write-Success { Write-Host "$greenCheck $($args -join ' ')" -ForegroundColor Green }
function Write-Error-Custom { Write-Host "$redX $($args -join ' ')" -ForegroundColor Red }
function Write-Warning-Custom { Write-Host "$warningIcon $($args -join ' ')" -ForegroundColor Yellow }
function Write-Info { Write-Host "$infoIcon $($args -join ' ')" -ForegroundColor Cyan }

Write-Host "`nDevPulse Supabase Deployment Setup`n" -ForegroundColor Cyan

# Step 1: Check prerequisites
Write-Host "Step 1: Checking Prerequisites" -ForegroundColor Yellow
Write-Host "--------------------------------`n"

# Check .env.local
if (Test-Path ".env.local") {
    Write-Success ".env.local found"
    $envContent = Get-Content ".env.local" | Where-Object { $_ -match "SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|KEY_ENCRYPTION_SECRET" }
    if ($envContent.Count -ge 2) {
        Write-Success "Required environment variables present"
    } else {
        Write-Error-Custom "Missing environment variables in .env.local"
        Write-Host "Add these to .env.local:`n"
        Write-Host "  SUPABASE_URL=your_project_url"
        Write-Host "  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key"
        Write-Host "  KEY_ENCRYPTION_SECRET=your_32_byte_hex_secret`n"
        exit 1
    }
} else {
    Write-Warning-Custom ".env.local not found"
    Write-Host "`nCreating .env.local template...`n"
    
    # Generate random secret
    $secret = -join ((0..31) | ForEach-Object { "{0:X2}" -f (Get-Random -Maximum 256) })
    
    $envContent = @"
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
KEY_ENCRYPTION_SECRET=$secret
"@
    
    Set-Content ".env.local" $envContent
    Write-Success ".env.local created with template"
    Write-Host "   Generated secret: $secret"
    Write-Host "   Please update with your Supabase credentials`n"
}

# Step 2: Check for Supabase project structure
Write-Host "Step 2: Checking Project Structure" -ForegroundColor Yellow
Write-Host "------------------------------------`n"

$checks = @(
    @{ path = "supabase/functions"; name = "Edge Functions" },
    @{ path = "supabase/migrations"; name = "Migrations" },
    @{ path = "supabase/config.toml"; name = "Supabase Config" }
)

foreach ($check in $checks) {
    if (Test-Path $check.path) {
        Write-Success "$($check.name) directory exists"
    } else {
        Write-Warning-Custom "$($check.name) directory not found"
    }
}

# Step 3: Function deployment checklist
Write-Host "`nStep 3: Edge Function Deployment" -ForegroundColor Yellow
Write-Host "---------------------------------`n"

$functionsPath = "supabase/functions"
if (Test-Path $functionsPath) {
    $functions = Get-ChildItem $functionsPath -Directory | Where-Object { $_.Name -notmatch "^_" } | Sort-Object Name
    
    Write-Host "Functions to deploy: $($functions.Count)`n"
    
    foreach ($fn in $functions) {
        if (Test-Path "$($fn.FullName)/index.ts") {
            Write-Success "$($fn.Name)"
        } else {
            Write-Warning-Custom "$($fn.Name) - no index.ts found"
        }
    }
}

# Step 4: Generate deployment commands
Write-Host "`nStep 4: Deployment Options" -ForegroundColor Yellow
Write-Host "----------------------------`n"

Write-Host "Option A: Automated (via Node.js)" -ForegroundColor Magenta
Write-Host "  Run: node deployment.js`n"

Write-Host "Option B: Manual via Supabase Dashboard" -ForegroundColor Magenta
Write-Host "  1. Go to your Supabase project dashboard"
Write-Host "  2. Navigate to Edge Functions"
Write-Host "  3. Create each function from supabase/functions/*"
Write-Host "  4. Set KEY_ENCRYPTION_SECRET in function settings"
Write-Host "  5. Configure database migrations in SQL Editor`n"

Write-Host "Option C: Manual via Supabase CLI" -ForegroundColor Magenta
Write-Host "  1. Install Supabase CLI globally"
Write-Host "  2. Run: supabase functions deploy"
Write-Host "  3. Run: supabase db push`n"

# Step 5: Post-deployment verification
Write-Host "Step 5: Post-Deployment Verification" -ForegroundColor Yellow
Write-Host "--------------------------------------`n"

Write-Host "After deployment, verify by:" -ForegroundColor White
Write-Host "  1. Open Supabase Dashboard > Edge Functions"
Write-Host "  2. Confirm 'user-api-keys' function is deployed"
Write-Host "  3. Confirm KEY_ENCRYPTION_SECRET is set"
Write-Host "  4. Run the frontend: npm run dev (or bun dev)"
Write-Host "  5. Navigate to HealthDashboard"
Write-Host "  6. Try adding a test API key"
Write-Host "  7. Verify key displays masked (****) in UI`n"

# Step 6: Troubleshooting
Write-Host "Step 6: Common Issues" -ForegroundColor Yellow
Write-Host "---------------------`n"

Write-Host "Issue: Functions won't deploy" -ForegroundColor Red
Write-Host "  Solution: Ensure Deno syntax is valid in Supabase editor`n"

Write-Host "Issue: KEY_ENCRYPTION_SECRET not recognized" -ForegroundColor Red
Write-Host "  Solution: Set in Supabase Dashboard > Edge Functions > Settings`n"

Write-Host "Issue: API keys not encrypting" -ForegroundColor Red
Write-Host "  Solution: Redeploy user-api-keys function after setting secret`n"

# Generation summary
Write-Host "`n" -NoNewline
Write-Success "Setup checklist complete!"
Write-Host ""
Write-Info "Generated files:"
Write-Info "  - DEPLOYMENT_GUIDE.md (detailed guide)"
Write-Info "  - deployment.js (automated script)"
Write-Info "  - This setup script"
Write-Host ""
Write-Host "Read DEPLOYMENT_GUIDE.md for complete instructions" -ForegroundColor Cyan
Write-Host "Next: Update .env.local and run deployment option of choice`n" -ForegroundColor Green
