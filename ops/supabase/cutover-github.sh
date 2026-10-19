#!/bin/sh
# Desde la iMac (gh logueado): guarda los secretos de build actuales, pone los del autoalojado y dispara el deploy.
set -eu
REPO=ezequielmayoni-afk/tc-flights-manager
SAFE=$HOME/.config/siviajo/github-secrets-cloud.env
mkdir -p "$(dirname "$SAFE")"
[ -f "$SAFE" ] || { grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' "$HOME/hub/.env.local" > "$SAFE"; chmod 600 "$SAFE"; }
ANON=$(ssh -i "$HOME/.ssh/deploy_vps" root@148.230.72.17 "grep '^ANON_KEY=' /opt/supabase/.env | cut -d= -f2-")
SERVICE=$(ssh -i "$HOME/.ssh/deploy_vps" root@148.230.72.17 "grep '^SERVICE_ROLE_KEY=' /opt/supabase/.env | cut -d= -f2-")
gh secret set NEXT_PUBLIC_SUPABASE_URL -R $REPO -b "https://hub.siviajo.com/supabase"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY -R $REPO -b "$ANON"
gh secret set SUPABASE_SERVICE_ROLE_KEY -R $REPO -b "$SERVICE"
gh workflow run "Deploy to Production" -R $REPO --ref main
echo "Deploy disparado. Al terminar: ssh root@148.230.72.17 sh /opt/supabase/cutover-finish.sh"
