use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum StakingError {
    InsufficientBond = 1,
    ActiveDisputesPending = 2,
    CooldownActive = 3,
    AppealAlreadyOpen = 4,
    NotEligibleArbiter = 5,
    UnauthorizedOperation = 6,
    InvalidAmount = 7,
    AlreadySuspended = 8,
    AppealNotFound = 9,
    AppealAlreadyResolved = 10,
    InvalidEscrowId = 11,
}
