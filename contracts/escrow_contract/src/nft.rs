use soroban_sdk::{contractclient, Address, Env};

/// Minimal interface for a Stellar-native NFT contract.
/// The `balance` function returns how many tokens of `id` the `owner` holds.
#[contractclient(name = "NftClient")]
pub trait NftInterface {
    fn balance(env: Env, owner: Address, id: u64) -> i128;
}
