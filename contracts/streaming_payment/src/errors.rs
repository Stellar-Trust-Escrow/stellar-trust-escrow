use soroban_sdk::contracterror;

#[contracterror(export = false)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StreamError {
    StreamNotFound = 1,
    AlreadyDrained = 2,
    NotRecipient = 3,
    NotSender = 4,
    AlreadyCompleted = 5,
    NotActive = 6,
    ZeroAmount = 7,
    InvalidRate = 8,
    InvalidStart = 9,
}
