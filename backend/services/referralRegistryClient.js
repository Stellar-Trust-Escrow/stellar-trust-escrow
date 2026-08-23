/**
 * referralRegistryClient.js
 *
 * Thin read-only wrapper around the on-chain `referral_registry` Soroban
 * contract's `get_referrer(escrow_id)` view function, built on top of the
 * existing simulateTransaction wrapper in services/stellarService.js (which
 * already carries the circuit breaker + tracing). No signing/auth needed —
 * this is a simulate-only (read) call, so any funded-or-not throwaway source
 * account works.
 */

import {
  Contract,
  TransactionBuilder,
  Account,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import { createModuleLogger } from '../config/logger.js';
import { simulateTransaction } from './stellarService.js';

const log = createModuleLogger('service.referralRegistryClient');

const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
const REFERRAL_REGISTRY_CONTRACT_ID = process.env.REFERRAL_REGISTRY_CONTRACT_ID || null;

// Any syntactically valid account id works as the simulate-only source; the
// call never gets submitted or signed. Sequence 0 is fine for simulation.
const SIMULATION_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/**
 * Returns the referrer address bound to an escrow, or null if none is
 * bound (or the registry isn't configured yet in this environment).
 */
export async function getReferrerOnChain(escrowId) {
  if (!REFERRAL_REGISTRY_CONTRACT_ID) {
    log.debug({ message: 'referral_registry_not_configured' });
    return null;
  }

  try {
    const contract = new Contract(REFERRAL_REGISTRY_CONTRACT_ID);
    const account = new Account(SIMULATION_SOURCE, '0');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_referrer', nativeToScVal(BigInt(escrowId), { type: 'u64' })))
      .setTimeout(30)
      .build();

    const sim = await simulateTransaction(tx.toXDR());
    if (sim?.error) {
      log.warn({ message: 'referral_registry_simulate_error', escrowId, error: sim.error });
      return null;
    }
    const retval = sim?.result?.retval;
    if (!retval) return null;

    const decoded = scValToNative(retval);
    return decoded ?? null; // Option<Address> -> address string or null
  } catch (err) {
    log.error({ message: 'referral_registry_read_failed', escrowId, error: err.message });
    return null;
  }
}

export default { getReferrerOnChain };
