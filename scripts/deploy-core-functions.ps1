# Deploy das Edge Functions core do ranking automático
# Pré-requisito: acesso ao projeto egupwrwzcuqazlshhfoq + `npx supabase link`

$ErrorActionPreference = "Stop"
$ProjectRef = "egupwrwzcuqazlshhfoq"

Write-Host "=== Deploy core ranking auto ===" -ForegroundColor Cyan
Write-Host "Projeto: $ProjectRef"

npx supabase functions deploy auto-process-ranking --project-ref $ProjectRef --no-verify-jwt
npx supabase functions deploy kill-activity-watchdog --project-ref $ProjectRef --no-verify-jwt

Write-Host ""
Write-Host "Opcional — pós-ranking e manuais:" -ForegroundColor Yellow
Write-Host "  npx supabase functions deploy check-milestones --project-ref $ProjectRef"
Write-Host "  npx supabase functions deploy check-badges --project-ref $ProjectRef"
Write-Host "  npx supabase functions deploy discord-webhook --project-ref $ProjectRef"
Write-Host ""
Write-Host "Secrets:" -ForegroundColor Yellow
Write-Host "  1. Copie supabase/.env.secrets.example -> supabase/.env.secrets e preencha"
Write-Host "  2. npx supabase secrets set --env-file supabase/.env.secrets --project-ref $ProjectRef"
