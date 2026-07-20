use soroban_sdk::contracterror;

#[contracterror(export = false)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum OwnershipError {
    /// Caller is not the current owner.
    NotOwner = 1,
    /// accept_transfer called by an address that is not the pending recipient.
    NotPendingRecipient = 2,
    /// accept_transfer called when no transfer offer is pending.
    NoPendingTransfer = 3,
    /// register called by an address other than the authorised escrow contract.
    Unauthorized = 4,
    /// Escrow has already been registered.
    AlreadyRegistered = 5,
    /// Escrow not found.
    NotFound = 6,
}
