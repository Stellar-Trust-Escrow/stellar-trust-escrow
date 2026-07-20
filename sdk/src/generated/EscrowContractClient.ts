/**
 * Auto-generated from contracts/escrow_contract/spec.json
 * Do not edit — run `node sdk/scripts/generate.js` to regenerate.
 */

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { invokeContract } from '../txBuilder.js';
import type { SdkConfig, TxResult, EscrowState, Milestone } from '../types.js';

export class EscrowContractClient {
  constructor(private readonly config: SdkConfig) {}

  /**
   * Creates a new escrow. Returns escrow_id.
   */
  async createEscrow(params: {
    caller: string;
    freelancer: string;
    token: string;
    totalAmount: bigint;
  }): Promise<TxResult<bigint>> {
    return invokeContract<bigint>(this.config, 'create_escrow', [
      new Address(params.caller).toScVal(),
      new Address(params.freelancer).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.totalAmount, { type: 'i128' }),
    ]);
  }

  /**
   * Adds a milestone to an escrow. Returns milestone_id.
   */
  async addMilestone(params: {
    caller: string;
    escrowId: bigint;
    description: string;
    amount: bigint;
  }): Promise<TxResult<number>> {
    return invokeContract<number>(this.config, 'add_milestone', [
      new Address(params.caller).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.description, { type: 'string' }),
      nativeToScVal(params.amount, { type: 'i128' }),
    ]);
  }

  /**
   * Freelancer marks a milestone as submitted.
   */
  async submitMilestone(params: {
    caller: string;
    escrowId: bigint;
    milestoneId: number;
  }): Promise<TxResult<null>> {
    return invokeContract<null>(this.config, 'submit_milestone', [
      new Address(params.caller).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.milestoneId, { type: 'u32' }),
    ]);
  }

  /**
   * Client approves a submitted milestone.
   */
  async approveMilestone(params: {
    caller: string;
    escrowId: bigint;
    milestoneId: number;
  }): Promise<TxResult<null>> {
    return invokeContract<null>(this.config, 'approve_milestone', [
      new Address(params.caller).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.milestoneId, { type: 'u32' }),
    ]);
  }

  /**
   * Releases funds for an approved milestone to the freelancer.
   */
  async releaseFunds(params: {
    caller: string;
    escrowId: bigint;
    milestoneId: number;
  }): Promise<TxResult<null>> {
    return invokeContract<null>(this.config, 'release_funds', [
      new Address(params.caller).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.milestoneId, { type: 'u32' }),
    ]);
  }

  /**
   * Cancels an escrow and returns funds to client.
   */
  async cancelEscrow(params: { caller: string; escrowId: bigint }): Promise<TxResult<null>> {
    return invokeContract<null>(this.config, 'cancel_escrow', [
      new Address(params.caller).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
    ]);
  }

  /**
   * Raises a dispute for a milestone.
   */
  async raiseDispute(params: {
    caller: string;
    escrowId: bigint;
    milestoneId: number;
  }): Promise<TxResult<null>> {
    return invokeContract<null>(this.config, 'raise_dispute', [
      new Address(params.caller).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.milestoneId, { type: 'u32' }),
    ]);
  }

  /**
   * Arbiter resolves a dispute.
   */
  async resolveDispute(params: {
    arbiter: string;
    escrowId: bigint;
    milestoneId: number;
    releaseToFreelancer: boolean;
  }): Promise<TxResult<null>> {
    return invokeContract<null>(this.config, 'resolve_dispute', [
      new Address(params.arbiter).toScVal(),
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.milestoneId, { type: 'u32' }),
      nativeToScVal(params.releaseToFreelancer, { type: 'bool' }),
    ]);
  }

  /**
   * Returns full escrow state.
   */
  async getEscrow(params: { escrowId: bigint }): Promise<TxResult<EscrowState>> {
    return invokeContract<EscrowState>(this.config, 'get_escrow', [
      nativeToScVal(params.escrowId, { type: 'u64' }),
    ]);
  }

  /**
   * Returns a single milestone.
   */
  async getMilestone(params: {
    escrowId: bigint;
    milestoneId: number;
  }): Promise<TxResult<Milestone>> {
    return invokeContract<Milestone>(this.config, 'get_milestone', [
      nativeToScVal(params.escrowId, { type: 'u64' }),
      nativeToScVal(params.milestoneId, { type: 'u32' }),
    ]);
  }
}
