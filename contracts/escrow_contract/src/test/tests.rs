#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Events, Address, Env, String};

#[test]
fn test_create_escrow_emits_event() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    // Verify event was emitted
    let events = env.events().all();
    assert_eq!(events.len(), 1);

    let event = &events[0];
    assert_eq!(event.0, ("EscrowCreated", "v1"));

    // Verify event contains correct data
    match event.2 {
        EscrowEvent::EscrowCreated {
            id: e_id,
            sender: e_sender,
            beneficiary: e_beneficiary,
            arbitrator: e_arbitrator,
            asset_contract: e_asset,
            amount: e_amount,
            timelock: e_timelock,
        } => {
            assert_eq!(e_id, id);
            assert_eq!(e_sender, sender);
            assert_eq!(e_beneficiary, beneficiary);
            assert_eq!(e_arbitrator, arbitrator);
            assert_eq!(e_asset, asset);
            assert_eq!(e_amount, 1000);
            assert_eq!(e_timelock, 3600);
        }
        _ => panic!("Wrong event type"),
    }
}

#[test]
fn test_fund_escrow_emits_event() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();

    // Verify event was emitted (2 events now: create + fund)
    let events = env.events().all();
    assert_eq!(events.len(), 2);

    let event = &events[1];
    assert_eq!(event.0, ("EscrowFunded", "v1"));

    match &event.2 {
        EscrowEvent::EscrowFunded {
            id: e_id,
            sender: e_sender,
            amount: e_amount,
        } => {
            assert_eq!(e_id, &id);
            assert_eq!(e_sender, &sender);
            assert_eq!(e_amount, &1000);
        }
        _ => panic!("Wrong event type"),
    }
}

#[test]
fn test_release_escrow_emits_event() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();
    MultiAssetEscrowContract::release_escrow(env.clone(), id.clone(), beneficiary.clone()).unwrap();

    // Verify event was emitted (3 events: create + fund + release)
    let events = env.events().all();
    assert_eq!(events.len(), 3);

    let event = &events[2];
    assert_eq!(event.0, ("EscrowReleased", "v1"));

    match &event.2 {
        EscrowEvent::EscrowReleased {
            id: e_id,
            beneficiary: e_beneficiary,
            amount: e_amount,
        } => {
            assert_eq!(e_id, &id);
            assert_eq!(e_beneficiary, &beneficiary);
            assert_eq!(e_amount, &1000);
        }
        _ => panic!("Wrong event type"),
    }
}

#[test]
fn test_refund_escrow_emits_event() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();
    MultiAssetEscrowContract::refund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();

    // Verify event was emitted (3 events: create + fund + refund)
    let events = env.events().all();
    assert_eq!(events.len(), 3);

    let event = &events[2];
    assert_eq!(event.0, ("EscrowRefunded", "v1"));

    match &event.2 {
        EscrowEvent::EscrowRefunded {
            id: e_id,
            sender: e_sender,
            amount: e_amount,
        } => {
            assert_eq!(e_id, &id);
            assert_eq!(e_sender, &sender);
            assert_eq!(e_amount, &1000);
        }
        _ => panic!("Wrong event type"),
    }
}

#[test]
fn test_dispute_escrow_emits_event() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();
    MultiAssetEscrowContract::dispute_escrow(env.clone(), id.clone(), beneficiary.clone()).unwrap();

    // Verify event was emitted (3 events: create + fund + dispute)
    let events = env.events().all();
    assert_eq!(events.len(), 3);

    let event = &events[2];
    assert_eq!(event.0, ("EscrowDisputed", "v1"));

    match &event.2 {
        EscrowEvent::EscrowDisputed {
            id: e_id,
            caller: e_caller,
        } => {
            assert_eq!(e_id, &id);
            assert_eq!(e_caller, &beneficiary);
        }
        _ => panic!("Wrong event type"),
    }
}

#[test]
fn test_resolve_dispute_emits_event() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();
    MultiAssetEscrowContract::dispute_escrow(env.clone(), id.clone(), beneficiary.clone()).unwrap();
    MultiAssetEscrowContract::resolve_dispute(env.clone(), id.clone(), arbitrator.clone(), true)
        .unwrap();

    // Verify event was emitted (4 events: create + fund + dispute + resolve)
    let events = env.events().all();
    assert_eq!(events.len(), 4);

    let event = &events[3];
    assert_eq!(event.0, ("EscrowResolved", "v1"));

    match &event.2 {
        EscrowEvent::EscrowResolved {
            id: e_id,
            arbitrator: e_arbitrator,
            release_to_beneficiary,
        } => {
            assert_eq!(e_id, &id);
            assert_eq!(e_arbitrator, &arbitrator);
            assert_eq!(release_to_beneficiary, &true);
        }
        _ => panic!("Wrong event type"),
    }
}

#[test]
fn test_events_are_not_emitted_on_failure() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));
    let attacker = Address::from_string(&String::from_str(&env, "G5"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    // Try to fund with attacker (should fail)
    let _ = MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), attacker);

    // No new events should be emitted (still just 1 event from creation)
    let events = env.events().all();
    assert_eq!(events.len(), 1);
}
