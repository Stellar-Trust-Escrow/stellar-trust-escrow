#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTRACTS=("escrow_contract" "insurance_contract")
ENV_FILE=".env"
DEPLOYED_ENV_FILE=".env.deployed"
DRY_RUN=false

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Load environment variables
if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Error: $ENV_FILE not found${NC}"
  exit 1
fi

source "$ENV_FILE"

# Validate required environment variables
required_vars=("SOROBAN_RPC_URL" "SOROBAN_NETWORK_PASSPHRASE" "STELLAR_SECRET_KEY")
for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo -e "${RED}Error: $var is not set in $ENV_FILE${NC}"
    exit 1
  fi
done

echo -e "${YELLOW}Starting Soroban testnet deployment...${NC}"
[[ "$DRY_RUN" == true ]] && echo -e "${YELLOW}(DRY RUN MODE)${NC}"

# Initialize deployed contracts file
> "$DEPLOYED_ENV_FILE"

# Deploy each contract
for contract in "${CONTRACTS[@]}"; do
  contract_path="contracts/$contract"
  
  if [[ ! -d "$contract_path" ]]; then
    echo -e "${RED}Error: Contract directory $contract_path not found${NC}"
    exit 1
  fi
  
  echo -e "\n${YELLOW}Processing $contract...${NC}"
  
  # Build
  echo -e "${YELLOW}Building $contract...${NC}"
  cmd="cd $contract_path && cargo build --release --target wasm32-unknown-unknown"
  if [[ "$DRY_RUN" == true ]]; then
    echo "  $ $cmd"
  else
    eval "$cmd" || { echo -e "${RED}Build failed for $contract${NC}"; exit 1; }
  fi
  
  # Upload
  echo -e "${YELLOW}Uploading $contract...${NC}"
  wasm_path="$contract_path/target/wasm32-unknown-unknown/release/${contract}.wasm"
  cmd="soroban contract upload --source-account \$STELLAR_SECRET_KEY --rpc-url \$SOROBAN_RPC_URL --network-passphrase \"\$SOROBAN_NETWORK_PASSPHRASE\" --wasm $wasm_path"
  if [[ "$DRY_RUN" == true ]]; then
    echo "  $ $cmd"
  else
    hash=$(eval "$cmd") || { echo -e "${RED}Upload failed for $contract${NC}"; exit 1; }
    echo -e "${GREEN}Uploaded: $hash${NC}"
  fi
  
  # Deploy
  echo -e "${YELLOW}Deploying $contract...${NC}"
  cmd="soroban contract deploy --source-account \$STELLAR_SECRET_KEY --rpc-url \$SOROBAN_RPC_URL --network-passphrase \"\$SOROBAN_NETWORK_PASSPHRASE\" --wasm-hash $hash"
  if [[ "$DRY_RUN" == true ]]; then
    echo "  $ $cmd"
  else
    contract_id=$(eval "$cmd") || { echo -e "${RED}Deploy failed for $contract${NC}"; exit 1; }
    echo -e "${GREEN}Deployed: $contract_id${NC}"
    echo "${contract^^}_ID=$contract_id" >> "$DEPLOYED_ENV_FILE"
  fi
  
  # Initialize
  echo -e "${YELLOW}Initializing $contract...${NC}"
  cmd="soroban contract invoke --source-account \$STELLAR_SECRET_KEY --rpc-url \$SOROBAN_RPC_URL --network-passphrase \"\$SOROBAN_NETWORK_PASSPHRASE\" --id $contract_id -- initialize"
  if [[ "$DRY_RUN" == true ]]; then
    echo "  $ $cmd"
  else
    eval "$cmd" || { echo -e "${RED}Initialize failed for $contract${NC}"; exit 1; }
    echo -e "${GREEN}Initialized${NC}"
  fi
done

if [[ "$DRY_RUN" == false ]]; then
  echo -e "\n${GREEN}Deployment complete!${NC}"
  echo -e "${GREEN}Contract IDs saved to $DEPLOYED_ENV_FILE${NC}"
else
  echo -e "\n${YELLOW}Dry run complete. No changes made.${NC}"
fi
