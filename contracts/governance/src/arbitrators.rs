//! # Decentralized Arbitrator Selection Pools
//!
//! Extends the existing arbitrator whitelist (managed in lib.rs) with:
//!
//! * A canonical ordered registry of whitelisted arbitrators.
//! * Pseudo-random selection of exactly 3 arbitrators per dispute using the
//!   ledger sequence number as a deterministic seed — no oracle dependency.
//! * 48-hour accept/decline window per selected arbitrator with automatic
//!   rotation to the next eligible candidate on timeout or decline.
//! * Round-robin load balancing: selection always prefers candidates with the
//!   lowest active assignment count to avoid repeat selection.
//! * No same arbitrator twice in a single dispute panel.

use soroban_sdk::{contracttype, symbol_short, Address, Env, Vec};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Number of arbitrators required per dispute panel.
pub const PANEL_SIZE: u32 = 3;

/// Accept/decline window in seconds (48 hours).
pub const ACCEPT_WINDOW_SECS: u64 = 172_800;

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub enum ArbKey {
    /// Ordered list of whitelisted arbitrator addresses.
    Registry,
    /// Active assignment count per arbitrator (for load balancing).
    Load(Address),
    /// Dispute panel record.
    Panel(u64),
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Acceptance status of one slot in a panel.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SlotStatus {
    /// Awaiting accept/decline from the selected arbitrator.
    Pending,
    /// Arbitrator accepted.
    Accepted,
    /// Arbitrator declined or timed out — slot was rotated.
    Rotated,
}

/// A single arbitrator slot within a dispute panel.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PanelSlot {
    pub arbitrator: Address,
    pub status: SlotStatus,
    /// Unix timestamp after which `rotate_arbitrator` may be called.
    pub deadline: u64,
}

/// The three-member arbitrator panel for a dispute.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ArbitratorPanel {
    pub dispute_id: u64,
    pub slots: Vec<PanelSlot>,
    pub created_at: u64,
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/// Derive a deterministic index into `len` using `seed`.
/// `seed` should combine ledger sequence + dispute_id for uniqueness.
pub fn seed_index(seed: u64, len: u64) -> u64 {
    if len == 0 {
        return 0;
    }
    // Simple xorshift-based mixing for better distribution
    let mut h = seed ^ (seed >> 33);
    h = h.wrapping_mul(0xff51afd7ed558ccd);
    h ^= h >> 33;
    h % len
}

// ── Storage operations ────────────────────────────────────────────────────────

/// Returns the current arbitrator registry.
pub fn get_registry(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&ArbKey::Registry)
        .unwrap_or_else(|| Vec::new(env))
}

fn set_registry(env: &Env, list: &Vec<Address>) {
    env.storage().instance().set(&ArbKey::Registry, list);
}

fn get_load(env: &Env, arb: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&ArbKey::Load(arb.clone()))
        .unwrap_or(0)
}

fn inc_load(env: &Env, arb: &Address) {
    let v = get_load(env, arb) + 1;
    env.storage()
        .persistent()
        .set(&ArbKey::Load(arb.clone()), &v);
}

fn dec_load(env: &Env, arb: &Address) {
    let v = get_load(env, arb).saturating_sub(1);
    env.storage()
        .persistent()
        .set(&ArbKey::Load(arb.clone()), &v);
}

fn load_panel(env: &Env, dispute_id: u64) -> Option<ArbitratorPanel> {
    env.storage().persistent().get(&ArbKey::Panel(dispute_id))
}

fn save_panel(env: &Env, panel: &ArbitratorPanel) {
    env.storage()
        .persistent()
        .set(&ArbKey::Panel(panel.dispute_id), panel);
}

// ── Registry management ───────────────────────────────────────────────────────

/// Add `arb` to the registry. No-op if already present.
pub fn registry_add(env: &Env, arb: &Address) {
    let mut list = get_registry(env);
    for i in 0..list.len() {
        if list.get(i).unwrap() == *arb {
            return;
        }
    }
    list.push_back(arb.clone());
    set_registry(env, &list);
    env.events()
        .publish((symbol_short!("arb_add"), arb.clone()), ());
}

/// Remove `arb` from the registry.
pub fn registry_remove(env: &Env, arb: &Address) {
    let list = get_registry(env);
    let mut new_list: Vec<Address> = Vec::new(env);
    for i in 0..list.len() {
        let a = list.get(i).unwrap();
        if a != *arb {
            new_list.push_back(a);
        }
    }
    set_registry(env, &new_list);
    env.events()
        .publish((symbol_short!("arb_rem"), arb.clone()), ());
}

/// Returns `true` if `arb` is in the registry.
pub fn registry_contains(env: &Env, arb: &Address) -> bool {
    let list = get_registry(env);
    for i in 0..list.len() {
        if list.get(i).unwrap() == *arb {
            return true;
        }
    }
    false
}

// ── Dispute panel selection ───────────────────────────────────────────────────

/// Select `PANEL_SIZE` arbitrators for `dispute_id`.
///
/// Uses `env.ledger().sequence()` XOR `dispute_id` as the pseudo-random seed.
/// Prefers arbitrators with the lowest current load (round-robin balancing).
/// Guarantees no duplicate arbitrators in the same panel.
///
/// # Errors
/// Returns `None` if the registry has fewer than `PANEL_SIZE` entries.
pub fn select_panel(env: &Env, dispute_id: u64) -> Option<ArbitratorPanel> {
    let registry = get_registry(env);
    if registry.len() < PANEL_SIZE {
        return None;
    }

    let now = env.ledger().timestamp();
    let seed_base = (env.ledger().sequence() as u64) ^ dispute_id;

    // Build sorted (load, index) pairs for deterministic low-load preference
    // We do a simple selection: iterate through candidates sorted by load,
    // using the seed to break ties.
    let n = registry.len() as u64;
    let mut selected: Vec<Address> = Vec::new(env);
    let mut used: Vec<u32> = Vec::new(env); // indices already selected

    for pick in 0..PANEL_SIZE {
        // Find the min-load candidate not already selected
        let mut best_idx: u32 = u32::MAX;
        let mut best_load: u32 = u32::MAX;
        let seed = seed_base.wrapping_add(pick as u64);

        for i in 0..registry.len() {
            // Skip if already selected
            let mut already_used = false;
            for j in 0..used.len() {
                if used.get(j).unwrap() == i {
                    already_used = true;
                    break;
                }
            }
            if already_used {
                continue;
            }
            let addr = registry.get(i).unwrap();
            let load = get_load(env, &addr);
            // Prefer lower load; use seed-derived offset for tie-breaking
            let tiebreak = seed_index(seed ^ i as u64, n);
            if load < best_load
                || (load == best_load && tiebreak < seed_index(seed ^ best_idx as u64, n))
            {
                best_load = load;
                best_idx = i;
            }
        }

        if best_idx == u32::MAX {
            return None;
        }

        let chosen = registry.get(best_idx).unwrap();
        selected.push_back(chosen.clone());
        used.push_back(best_idx);
        inc_load(env, &chosen);
    }

    // Build panel slots
    let mut slots: Vec<PanelSlot> = Vec::new(env);
    for i in 0..selected.len() {
        slots.push_back(PanelSlot {
            arbitrator: selected.get(i).unwrap(),
            status: SlotStatus::Pending,
            deadline: now + ACCEPT_WINDOW_SECS,
        });
    }

    let panel = ArbitratorPanel {
        dispute_id,
        slots,
        created_at: now,
    };
    save_panel(env, &panel);

    env.events()
        .publish((symbol_short!("arb_sel"), dispute_id), ());

    Some(panel)
}

/// Accept an arbitration assignment.
///
/// The caller must be one of the pending arbitrators in the panel and must
/// call within the 48-hour accept window.
pub fn accept_arbitration(
    env: &Env,
    dispute_id: u64,
    arbitrator: &Address,
) -> Result<(), ArbError> {
    let mut panel = load_panel(env, dispute_id).ok_or(ArbError::PanelNotFound)?;
    let now = env.ledger().timestamp();

    let mut found = false;
    let mut new_slots: Vec<PanelSlot> = Vec::new(env);
    for i in 0..panel.slots.len() {
        let mut slot = panel.slots.get(i).unwrap();
        if slot.arbitrator == *arbitrator && slot.status == SlotStatus::Pending {
            if now > slot.deadline {
                new_slots.push_back(slot);
                continue;
            }
            slot.status = SlotStatus::Accepted;
            found = true;
        }
        new_slots.push_back(slot);
    }

    if !found {
        return Err(ArbError::NotPanelMember);
    }

    panel.slots = new_slots;
    save_panel(env, &panel);

    env.events()
        .publish((symbol_short!("arb_acc"), dispute_id), arbitrator.clone());
    Ok(())
}

/// Decline an arbitration assignment.
///
/// The caller must be one of the pending arbitrators. Automatically triggers
/// rotation to the next eligible registry candidate.
pub fn decline_arbitration(
    env: &Env,
    dispute_id: u64,
    arbitrator: &Address,
) -> Result<(), ArbError> {
    rotate_slot(env, dispute_id, arbitrator, false)
}

/// Rotate a timed-out slot to the next eligible arbitrator.
///
/// Can be called by anyone after the deadline has passed.
pub fn rotate_timed_out(env: &Env, dispute_id: u64, slot_idx: u32) -> Result<(), ArbError> {
    let panel = load_panel(env, dispute_id).ok_or(ArbError::PanelNotFound)?;
    let slot = panel
        .slots
        .get(slot_idx)
        .ok_or(ArbError::InvalidSlotIndex)?;

    if slot.status != SlotStatus::Pending {
        return Err(ArbError::SlotAlreadyResolved);
    }
    let now = env.ledger().timestamp();
    if now <= slot.deadline {
        return Err(ArbError::DeadlineNotPassed);
    }

    rotate_slot(env, dispute_id, &slot.arbitrator, true)
}

/// Internal: rotate a slot by replacing the given arbitrator.
fn rotate_slot(
    env: &Env,
    dispute_id: u64,
    outgoing: &Address,
    is_timeout: bool,
) -> Result<(), ArbError> {
    let mut panel = load_panel(env, dispute_id).ok_or(ArbError::PanelNotFound)?;
    let now = env.ledger().timestamp();

    // Collect current panel members (to avoid re-selecting them)
    let mut current_members: Vec<Address> = Vec::new(env);
    for i in 0..panel.slots.len() {
        let s = panel.slots.get(i).unwrap();
        if s.status != SlotStatus::Rotated {
            current_members.push_back(s.arbitrator.clone());
        }
    }

    // Find the next eligible candidate from the registry
    let registry = get_registry(env);
    let seed = (env.ledger().sequence() as u64)
        .wrapping_add(dispute_id)
        .wrapping_add(if is_timeout { 0x1 } else { 0x2 });

    let mut replacement: Option<Address> = None;
    let mut best_load: u32 = u32::MAX;
    let n = registry.len() as u64;

    for i in 0..registry.len() {
        let addr = registry.get(i).unwrap();
        // Skip if already in panel
        let mut in_panel = false;
        for j in 0..current_members.len() {
            if current_members.get(j).unwrap() == addr {
                in_panel = true;
                break;
            }
        }
        if in_panel {
            continue;
        }
        let load = get_load(env, &addr);
        let tiebreak = seed_index(seed ^ i as u64, n);
        if load < best_load
            || (load == best_load && tiebreak < seed_index(seed ^ best_load as u64, n))
        {
            best_load = load;
            replacement = Some(addr);
        }
    }

    // Apply rotation
    let new_arb = replacement.ok_or(ArbError::NoReplacementAvailable)?;
    dec_load(env, outgoing);
    inc_load(env, &new_arb);

    let mut new_slots: Vec<PanelSlot> = Vec::new(env);
    let mut rotated = false;
    for i in 0..panel.slots.len() {
        let mut slot = panel.slots.get(i).unwrap();
        if slot.arbitrator == *outgoing && slot.status == SlotStatus::Pending && !rotated {
            slot.status = SlotStatus::Rotated;
            new_slots.push_back(slot);
            // Add replacement slot
            new_slots.push_back(PanelSlot {
                arbitrator: new_arb.clone(),
                status: SlotStatus::Pending,
                deadline: now + ACCEPT_WINDOW_SECS,
            });
            rotated = true;
        } else {
            new_slots.push_back(slot);
        }
    }

    if !rotated {
        return Err(ArbError::NotPanelMember);
    }

    panel.slots = new_slots;
    save_panel(env, &panel);

    env.events().publish(
        (symbol_short!("arb_rot"), dispute_id),
        (outgoing.clone(), new_arb),
    );
    Ok(())
}

/// Returns the panel for a dispute, if it exists.
pub fn get_panel(env: &Env, dispute_id: u64) -> Option<ArbitratorPanel> {
    load_panel(env, dispute_id)
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ArbError {
    PanelNotFound,
    NotPanelMember,
    SlotAlreadyResolved,
    DeadlineNotPassed,
    NoReplacementAvailable,
    InvalidSlotIndex,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod arb_tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{contract, contractimpl, Address, Env};

    #[contract]
    struct TestContract;
    #[contractimpl]
    impl TestContract {}

    fn mk_env() -> (Env, Address) {
        let env = Env::default();
        let id = env.register_contract(None, TestContract);
        (env, id)
    }

    // ── seed_index pure tests ─────────────────────────────────────────────────

    #[test]
    fn test_seed_index_zero_len_guard() {
        assert_eq!(seed_index(12345, 0), 0);
    }

    #[test]
    fn test_seed_index_in_bounds() {
        for len in 1u64..=10 {
            let idx = seed_index(0xdeadbeef, len);
            assert!(idx < len);
        }
    }

    #[test]
    fn test_seed_index_deterministic() {
        assert_eq!(seed_index(42, 7), seed_index(42, 7));
    }

    // ── Registry tests ────────────────────────────────────────────────────────

    #[test]
    fn test_registry_add_remove() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            let a = Address::generate(&env);
            registry_add(&env, &a);
            assert!(registry_contains(&env, &a));
            assert_eq!(get_registry(&env).len(), 1);

            registry_remove(&env, &a);
            assert!(!registry_contains(&env, &a));
            assert_eq!(get_registry(&env).len(), 0);
        });
    }

    #[test]
    fn test_registry_add_duplicate_noop() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            let a = Address::generate(&env);
            registry_add(&env, &a);
            registry_add(&env, &a);
            assert_eq!(get_registry(&env).len(), 1);
        });
    }

    // ── Panel selection tests ─────────────────────────────────────────────────

    #[test]
    fn test_select_panel_requires_enough_arbitrators() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            let a = Address::generate(&env);
            let b = Address::generate(&env);
            registry_add(&env, &a);
            registry_add(&env, &b);
            // Only 2 arbitrators — need 3
            assert!(select_panel(&env, 1).is_none());
        });
    }

    #[test]
    fn test_select_panel_no_duplicates() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            for _ in 0..5 {
                registry_add(&env, &Address::generate(&env));
            }
            let panel = select_panel(&env, 99).unwrap();
            assert_eq!(panel.slots.len(), PANEL_SIZE);

            // Check all 3 arbitrators are distinct
            let s0 = panel.slots.get(0).unwrap().arbitrator;
            let s1 = panel.slots.get(1).unwrap().arbitrator;
            let s2 = panel.slots.get(2).unwrap().arbitrator;
            assert_ne!(s0, s1);
            assert_ne!(s0, s2);
            assert_ne!(s1, s2);
        });
    }

    #[test]
    fn test_select_panel_all_slots_pending() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            for _ in 0..3 {
                registry_add(&env, &Address::generate(&env));
            }
            let panel = select_panel(&env, 1).unwrap();
            for i in 0..panel.slots.len() {
                assert_eq!(panel.slots.get(i).unwrap().status, SlotStatus::Pending);
            }
        });
    }

    #[test]
    fn test_select_panel_increments_load() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            let arbs: Vec<Address> = {
                let mut v = soroban_sdk::Vec::new(&env);
                for _ in 0..3 {
                    let a = Address::generate(&env);
                    registry_add(&env, &a);
                    v.push_back(a);
                }
                v
            };
            select_panel(&env, 1).unwrap();
            // Total load across all 3 selected == PANEL_SIZE
            let total_load: u32 = (0..arbs.len())
                .map(|i| get_load(&env, &arbs.get(i).unwrap()))
                .sum();
            assert_eq!(total_load, PANEL_SIZE);
        });
    }

    // ── Accept / decline / timeout tests ─────────────────────────────────────

    #[test]
    fn test_accept_arbitration() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            for _ in 0..3 {
                registry_add(&env, &Address::generate(&env));
            }
            let panel = select_panel(&env, 10).unwrap();
            let arb = panel.slots.get(0).unwrap().arbitrator;

            accept_arbitration(&env, 10, &arb).unwrap();

            let updated = get_panel(&env, 10).unwrap();
            assert_eq!(updated.slots.get(0).unwrap().status, SlotStatus::Accepted);
        });
    }

    #[test]
    fn test_decline_rotates_slot() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            // 4 arbitrators so rotation has a replacement
            for _ in 0..4 {
                registry_add(&env, &Address::generate(&env));
            }
            let panel = select_panel(&env, 20).unwrap();
            let original = panel.slots.get(0).unwrap().arbitrator.clone();

            decline_arbitration(&env, 20, &original).unwrap();

            let updated = get_panel(&env, 20).unwrap();
            // Slot 0 should now be Rotated, and a new Pending slot added
            assert_eq!(updated.slots.get(0).unwrap().status, SlotStatus::Rotated);
            // A 4th slot should now exist (replacement)
            assert_eq!(updated.slots.len(), 4);
        });
    }

    #[test]
    fn test_timeout_rotation_before_deadline_fails() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            for _ in 0..4 {
                registry_add(&env, &Address::generate(&env));
            }
            select_panel(&env, 30).unwrap();
            // Deadline hasn't passed yet
            let result = rotate_timed_out(&env, 30, 0);
            assert_eq!(result, Err(ArbError::DeadlineNotPassed));
        });
    }

    #[test]
    fn test_timeout_rotation_after_deadline_succeeds() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            for _ in 0..4 {
                registry_add(&env, &Address::generate(&env));
            }
            select_panel(&env, 40).unwrap();

            // Advance past the 48-hour window
            env.ledger()
                .with_mut(|l| l.timestamp += ACCEPT_WINDOW_SECS + 1);

            rotate_timed_out(&env, 40, 0).unwrap();

            let updated = get_panel(&env, 40).unwrap();
            assert_eq!(updated.slots.get(0).unwrap().status, SlotStatus::Rotated);
        });
    }

    #[test]
    fn test_accept_non_panel_member_fails() {
        let (env, id) = mk_env();
        env.as_contract(&id, || {
            for _ in 0..3 {
                registry_add(&env, &Address::generate(&env));
            }
            select_panel(&env, 50).unwrap();
            let outsider = Address::generate(&env);
            let result = accept_arbitration(&env, 50, &outsider);
            assert_eq!(result, Err(ArbError::NotPanelMember));
        });
    }
}
