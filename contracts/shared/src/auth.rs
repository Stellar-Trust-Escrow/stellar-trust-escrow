use soroban_sdk::{Address, Env, Vec};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdminThresholdError {
    InvalidThreshold,
    MissingSigner,
    ThresholdNotMet,
}

/// Requires that at least `threshold` unique `signers` are members of `admins`,
/// and that each signer has authorized the call.
pub fn require_admin_threshold(
    env: &Env,
    admins: &Vec<Address>,
    threshold: u32,
    signers: &Vec<Address>,
) -> Result<(), AdminThresholdError> {
    if threshold == 0 {
        return Err(AdminThresholdError::InvalidThreshold);
    }

    // Count unique, authorized admin signers.
    let mut counted: Vec<Address> = Vec::new(env);
    let mut ok: u32 = 0;

    for i in 0..signers.len() {
        let s = signers.get(i).ok_or(AdminThresholdError::MissingSigner)?;
        if counted.contains(&s) {
            continue;
        }
        if !admins.contains(&s) {
            continue;
        }
        s.require_auth();
        counted.push_back(s);
        ok = ok.saturating_add(1);
        if ok >= threshold {
            return Ok(());
        }
    }

    Err(AdminThresholdError::ThresholdNotMet)
}
