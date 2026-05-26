# HashiCorp Vault Policy — stellar-trust-app
#
# Grants the application's AppRole read-only access to the KV v2 secrets
# path and the ability to renew its own token. This policy also includes
# additional security and privacy considerations as per the documentation
# requirements.
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

# Allow access to encryption keys for data at rest
path "stellar-trust/keys/encryption" {
  capabilities = ["read"]
}

# Allow access to encryption keys for data in transit
path "stellar-trust/keys/transport" {
  capabilities = ["read"]
}

# Allow the app to manage its own wallet integration security
path "stellar-trust/data/wallet" {
  capabilities = ["read", "list"]
}

# Allow access to GDPR compliance statements
path "stellar-trust/data/gdpr" {
  capabilities = ["read"]
}

# Allow access to bug bounty program terms
path "stellar-trust/data/bug-bounty" {
  capabilities = ["read"]
}

# Allow access to incident response plan
path "stellar-trust/data/incident-response" {
  capabilities = ["read"]
}

# Allow access to third-party risk assessment
path "stellar-trust/data/third-party-risk" {
  capabilities = ["read"]
}

# Allow access to security and privacy documentation
path "stellar-trust/data/security-docs" {
  capabilities = ["read"]
}

# Allow access to data storage documentation
path "stellar-trust/data/storage-docs" {
  capabilities = ["read"]
}

# Allow access to encryption documentation
path "stellar-trust/data/encryption-docs" {
  capabilities = ["read"]
}

# Allow access to key management documentation
path "stellar-trust/data/key-management-docs" {
  capabilities = ["read"]
}

# Allow access to privacy guarantees documentation
path "stellar-trust/data/privacy-docs" {
  capabilities = ["read"]
}