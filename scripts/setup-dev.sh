#!/usr/bin/env bash
# scripts/setup-dev.sh
# Run once from repo root on your local machine to:
#   1. Run all 33 DB migrations against Supabase
#   2. Set app_user password
#   3. Seed departments + manufacturing ops
#   4. Create a test admin user in Supabase Auth
#
# Prerequisites: pnpm, psql (or skip psql steps and use Supabase SQL editor)
#
# Usage:
#   chmod +x scripts/setup-dev.sh
#   ./scripts/setup-dev.sh
#
set -euo pipefail

DB_URL="postgresql://postgres.khjvkhzwfzuwzrusgobp:MM2022mm%21%21%21@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
APP_USER_PASS="NExVJJZlP5JZPeHDY_LC5ilYQJ4pomMb"
SUPABASE_URL="https://khjvkhzwfzuwzrusgobp.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoanZraHp3Znp1d3pydXNnb2JwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3MzcyNCwiZXhwIjoyMDkyMzQ5NzI0fQ.-SbUXq_GWMjL7g9Xe-rKrqwNt3ujGLuwGnk-M_Z4L-I"

echo "🔧 Step 1: Run DB migrations..."
export DATABASE_URL="$DB_URL"
export DATABASE_URL_OWNER="$DB_URL"
pnpm --filter @monopilot/db migrate
echo "✅ Migrations done"

echo ""
echo "🔧 Step 2: Set app_user password..."
PGPASSWORD="MM2022mm!!!" psql \
  -h aws-0-eu-central-1.pooler.supabase.com -p 5432 \
  -U "postgres.khjvkhzwfzuwzrusgobp" -d postgres \
  -c "ALTER ROLE app_user WITH PASSWORD '$APP_USER_PASS';"
echo "✅ app_user password set"

echo ""
echo "🔧 Step 3: Run seed files..."
PGPASSWORD="MM2022mm!!!" psql \
  -h aws-0-eu-central-1.pooler.supabase.com -p 5432 \
  -U "postgres.khjvkhzwfzuwzrusgobp" -d postgres \
  -f packages/db/seeds/apex-departments.sql \
  -f packages/db/seeds/cascade-rules.sql \
  -f packages/db/seeds/manufacturing-operations.sql
echo "✅ Seeds applied"

echo ""
echo "🔧 Step 4: Create test admin user in Supabase Auth..."
# Creates user: admin@monopilot.test / Admin2026!!
RESPONSE=$(curl -sf -X POST \
  "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@monopilot.test",
    "password": "Admin2026!!",
    "email_confirm": true,
    "user_metadata": {"full_name": "Apex Admin"},
    "app_metadata": {"org_id": "00000000-0000-0000-0000-000000000002", "role": "admin"}
  }' 2>&1)

USER_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id','ERROR'))" 2>/dev/null || echo "check output")
echo "✅ Test user created: admin@monopilot.test / Admin2026!!"
echo "   Supabase Auth UID: $USER_ID"

echo ""
echo "🎉 Dev setup complete!"
echo ""
echo "Test credentials:"
echo "  URL:      http://localhost:3000"
echo "  Email:    admin@monopilot.test"
echo "  Password: Admin2026!!"
echo ""
echo "Next steps:"
echo "  pnpm dev        # start local dev server"
echo "  pnpm typecheck  # verify types"
echo "  pnpm test       # run unit tests"
