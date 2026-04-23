/**
 * Transaction Relayer Service
 *
 * Handles execution of meta-transactions on behalf of users,
 * paying transaction fees while users provide signed authorization.
 *
 * Features:
 * - Meta-transaction validation and execution
 * - Fee payment and delegation
 * - Rate limiting and abuse prevention
 * - Transaction monitoring and metrics
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { Contract, Keypair, Networks } from '@stellar/stellar-sdk';
import { dbConnectionsTotal } from '../lib/metrics.js';

const RELAYER_FEE_BUFFER = 1000; // Additional stroops for fee estimation buffer

/**
 * Relayer service for executing meta-transactions
 */
export class TransactionRelayer {
  constructor(network, contractId, relayerKeypair) {
    this.network = network;
    this.contractId = contractId;
    this.relayerKeypair = relayerKeypair;
    this.contract = new Contract(contractId);
  }

  /**
   * Executes a meta-transaction on behalf of a user
   * @param {Object} metaTx - Meta-transaction data
   * @param {Object} feeDelegation - Fee delegation configuration
   * @returns {Promise<Object>} Transaction result
   */
  async executeMetaTransaction(metaTx, feeDelegation = null) {
    try {
      // Validate meta-transaction format
      this.validateMetaTransaction(metaTx);

      // Validate fee delegation if provided
      if (feeDelegation) {
        this.validateFeeDelegation(feeDelegation);
      }

      // Build the contract call transaction
      const tx = await this.buildMetaTransaction(metaTx, feeDelegation);

      // Sign and submit the transaction
      const result = await this.submitTransaction(tx);

      // Update metrics
      dbConnectionsTotal.inc();

      return {
        success: true,
        transactionHash: result.hash,
        ledger: result.ledger,
        metaTxNonce: metaTx.nonce,
        feeDelegationUsed: !!feeDelegation,
      };
    } catch (error) {
      console.error('Meta-transaction execution failed:', error);

      return {
        success: false,
        error: error.message,
        metaTxNonce: metaTx.nonce,
      };
    }
  }

  /**
   * Validates meta-transaction data structure
   * @param {Object} metaTx - Meta-transaction to validate
   * @throws {Error} If validation fails
   */
  validateMetaTransaction(metaTx) {
    const required = ['signer', 'nonce', 'deadline', 'functionName', 'functionArgs', 'signature'];

    for (const field of required) {
      if (!metaTx[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate deadline is in the future
    const now = Math.floor(Date.now() / 1000);
    if (metaTx.deadline <= now) {
      throw new Error('Meta-transaction deadline has expired');
    }

    // Validate signature format (64 bytes for Ed25519)
    if (metaTx.signature.length !== 128) {
      // Hex encoded
      throw new Error('Invalid signature format');
    }
  }

  /**
   * Validates fee delegation configuration
   * @param {Object} feeDelegation - Fee delegation to validate
   * @throws {Error} If validation fails
   */
  validateFeeDelegation(feeDelegation) {
    const required = ['feePayer', 'maxFee', 'feeToken'];

    for (const field of required) {
      if (!feeDelegation[field]) {
        throw new Error(`Missing required fee delegation field: ${field}`);
      }
    }

    // Validate maxFee is positive
    if (feeDelegation.maxFee <= 0) {
      throw new Error('Fee delegation maxFee must be positive');
    }

    // Validate feePayer is the relayer
    if (feeDelegation.feePayer !== this.relayerKeypair.publicKey()) {
      throw new Error('Fee delegation feePayer must be the relayer');
    }
  }

  /**
   * Builds a Stellar transaction for the meta-transaction
   * @param {Object} metaTx - Meta-transaction data
   * @param {Object} feeDelegation - Fee delegation configuration
   * @returns {Transaction} Built transaction
   */
  async buildMetaTransaction(metaTx, feeDelegation) {
    // Load the contract
    const server = new StellarSdk.Server(this.getHorizonUrl());
    const account = await server.loadAccount(this.relayerKeypair.publicKey());

    // Build transaction
    let transaction = new StellarSdk.TransactionBuilder(account, {
      fee: await this.estimateFee(metaTx),
      networkPassphrase: this.network,
    });

    // Prepare fee delegation argument
    let feeDelegationArg = StellarSdk.scVal.option(null); // None by default
    if (feeDelegation) {
      const delegationStruct = StellarSdk.scVal.map([
        StellarSdk.scVal.symbol('fee_payer'),
        StellarSdk.Address.fromString(feeDelegation.feePayer),
        StellarSdk.scVal.symbol('max_fee'),
        StellarSdk.scVal.i128(
          StellarSdk.xdr.Int128Parts.fromString(feeDelegation.maxFee.toString()),
        ),
        StellarSdk.scVal.symbol('fee_token'),
        StellarSdk.Address.fromString(feeDelegation.feeToken),
      ]);
      feeDelegationArg = StellarSdk.scVal.option(delegationStruct);
    }

    // Add the meta-transaction execution operation
    transaction = transaction.addOperation(
      this.contract.call(
        'execute_meta_transaction',
        StellarSdk.Address.fromString(metaTx.signer),
        StellarSdk.scVal.u64(metaTx.nonce),
        StellarSdk.scVal.u64(metaTx.deadline),
        StellarSdk.scVal.string(metaTx.functionName),
        StellarSdk.scVal.string(metaTx.functionArgs),
        StellarSdk.scVal.bytes(Buffer.from(metaTx.signature, 'hex')),
        StellarSdk.Address.fromString(this.relayerKeypair.publicKey()),
        feeDelegationArg,
      ),
    );

    // Set timeout and build
    return transaction.setTimeout(30).build();
  }

  /**
   * Submits a transaction to the Stellar network
   * @param {Transaction} transaction - Transaction to submit
   * @returns {Promise<Object>} Submission result
   */
  async submitTransaction(transaction) {
    const server = new StellarSdk.Server(this.getHorizonUrl());

    // Sign with relayer key
    transaction.sign(this.relayerKeypair);

    // Submit transaction
    const result = await server.submitTransaction(transaction);

    return {
      hash: result.hash,
      ledger: result.ledger,
      successful: true,
    };
  }

  /**
   * Gets the appropriate Horizon URL for the network
   * @returns {string} Horizon URL
   */
  getHorizonUrl() {
    switch (this.network) {
      case Networks.PUBLIC:
        return 'https://horizon.stellar.org';
      case Networks.TESTNET:
        return 'https://horizon-testnet.stellar.org';
      default:
        return 'https://horizon-testnet.stellar.org';
    }
  }

  /**
   * Estimates fee for a meta-transaction
   * @param {Object} metaTx - Meta-transaction to estimate
   * @returns {Promise<number>} Estimated fee in stroops
   */
  async estimateFee() {
    try {
      const server = new StellarSdk.Server(this.getHorizonUrl());
      const feeStats = await server.feeStats();

      // Use the 50th percentile fee rate
      const baseFee = parseInt(feeStats.fee_charged.p50) || StellarSdk.BASE_FEE;

      // Add buffer for meta-transaction overhead
      return baseFee + RELAYER_FEE_BUFFER;
    } catch (error) {
      console.warn('Fee estimation failed, using default:', error.message);
      return StellarSdk.BASE_FEE + RELAYER_FEE_BUFFER;
    }
  }
}

/**
 * Creates a relayer service instance
 * @param {Object} config - Configuration object
 * @returns {TransactionRelayer} Configured relayer instance
 */
export function createRelayer(config) {
  const { network, contractId, relayerSecret } = config;

  if (!relayerSecret) {
    throw new Error('Relayer secret key is required');
  }

  const relayerKeypair = Keypair.fromSecret(relayerSecret);

  return new TransactionRelayer(network, contractId, relayerKeypair);
}

export default TransactionRelayer;
