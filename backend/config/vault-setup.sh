#!/usr/bin/env bash
# vault-setup.sh
#
# One-time Vault bootstrap for StellarTrustEscrow.
# Run this after starting Vault in dev mode or after unsealing a new cluster.
#
# Usage:
#   export VAULT_ADDR=http://127.0.0.1:8200
#   export VAULT_TOKEN=<root-token>
#   bash backend/config/vault-setup.sh

set -euo pipefail

echo "==> Enabling KV v2 secrets engine at stellar-trust/"
vault secrets enable -path=stellar-trust kv-v2 2>/dev/null || echo "  (already enabled)"

echo "==> Writing application secrets"
vault kv put stellar-trust/app \
  DATABASE_URL="${DATABASE_URL:-postgresql://postgres:password@localhost:5432/stellar_trust_escrow}" \
  JWT_SECRET="${JWT_SECRET:-change_this_in_production}" \
  ADMIN_API_KEY="${ADMIN_API_KEY:-change_this_to_a_strong_random_secret}" \
  SENDGRID_API_KEY="${SENDGRID_API_KEY:-}" \
  EMAIL_UNSUBSCRIBE_SECRET="${EMAIL_UNSUBSCRIBE_SECRET:-change_this_secret}" \
  SENTRY_DSN="${SENTRY_DSN:-}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}" \
  STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}" \
  SUMSUB_APP_TOKEN="${SUMSUB_APP_TOKEN:-}" \
  SUMSUB_SECRET_KEY="${SUMSUB_SECRET_KEY:-}" \
  RELAYER_SECRET_KEY="${RELAYER_SECRET_KEY:-}" \
  METRICS_TOKEN="${METRICS_TOKEN:-}"

echo "==> Writing Vault policy"
vault policy write stellar-trust-app backend/config/vault-policy.hcl

echo "==> Enabling AppRole auth"
vault auth enable approle 2>/dev/null || echo "  (already enabled)"

echo "==> Creating AppRole for the application"
vault write auth/approle/role/stellar-trust-app \
  token_policies="stellar-trust-app" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=0 \
  secret_id_num_uses=0

echo ""
echo "==> Credentials for .env (set SECRETS_BACKEND=vault to activate)"
echo "VAULT_ROLE_ID=$(vault read -field=role_id auth/approle/role/stellar-trust-app/role-id)"
echo "VAULT_SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/stellar-trust-app/secret-id)"
echo ""
echo "Done. Add VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID to your .env and set SECRETS_BACKEND=vault"
