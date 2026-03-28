# HashiCorp Vault Policy — stellar-trust-app
#
# Grants the application's AppRole read-only access to the KV v2 secrets
# path and the ability to renew its own token.
#
# Apply with:
#   vault policy write stellar-trust-app backend/config/vault-policy.hcl

# Read all secrets under stellar-trust/app
path "stellar-trust/data/app" {
  capabilities = ["read"]
}

# Allow reading specific versioned secrets
path "stellar-trust/data/app/*" {
  capabilities = ["read"]
}

# Allow listing secret keys (for rotation checks)
path "stellar-trust/metadata/app" {
  capabilities = ["list", "read"]
}

# Allow the app to renew its own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Allow the app to look up its own token info
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
