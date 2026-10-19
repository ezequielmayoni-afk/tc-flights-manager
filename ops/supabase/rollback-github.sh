#!/bin/sh
# Desde la iMac: vuelve a poner los secretos de build de Supabase cloud y dispara el deploy.
set -eu
REPO=ezequielmayoni-afk/tc-flights-manager
SAFE=$HOME/.config/siviajo/github-secrets-cloud.env
. "$SAFE"
gh secret set NEXT_PUBLIC_SUPABASE_URL -R $REPO -b "$NEXT_PUBLIC_SUPABASE_URL"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY -R $REPO -b "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
gh secret set SUPABASE_SERVICE_ROLE_KEY -R $REPO -b "$SUPABASE_SERVICE_ROLE_KEY"
gh workflow run "Deploy to Production" -R $REPO --ref main
