use soroban_sdk::contracterror;

#[contracterror(export = false)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReferralError {
    /// register_code called with a code that's already registered to someone.
    CodeTaken = 1,
    /// register_code called by an address that already has a code.
    AlreadyRegistered = 2,
    /// bind_referral called with a code that has no registered owner.
    UnknownCode = 3,
    /// bind_referral called for an escrow_id that already has a referral bound.
    AlreadyBound = 4,
}
