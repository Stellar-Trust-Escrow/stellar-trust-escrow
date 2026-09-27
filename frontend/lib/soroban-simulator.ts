/**
 * Soroban Transaction Simulation Sandbox Service
 * Implements client-side dry-run simulation before Freighter signing.
 * Provides fee breakdown, storage state diff decoding (EscrowState, MilestoneState, u128),
 * risk indicator assessment, and human-readable error extraction.
 */

export interface FeeEstimate {
  resource_fee: number; // in stroops
  base_fee: number; // in stroops
  total_fee_stroops: number;
  total_fee_xlm: string; // 7 decimal places
  total_fee_usd: string; // 2 decimal places
  cpu_instructions?: number;
  memory_bytes?: number;
}

export interface RiskIndicator {
  level: 'low' | 'medium' | 'high';
  type: 'footprint' | 'fee' | 'compute' | 'error';
  message: string;
}

export interface LedgerEntryDiff {
  key: string;
  key_type: string;
  old_value: any;
  new_value: any;
  decoded_type?: string;
}

export interface ActionSummary {
  method: string;
  contract_id?: string;
  args: Record<string, any>;
  description: string;
}

export interface SimulationResult {
  success: boolean;
  fee_estimate: FeeEstimate;
  state_diff: LedgerEntryDiff[];
  risk_indicators: RiskIndicator[];
  action_summary: ActionSummary;
  error?: string;
  raw_response?: any;
}

// Known Soroban contract error codes mapped to friendly messages
const CONTRACT_ERROR_MAP: Record<number, string> = {
  1: 'Unauthorized caller',
  101: 'Escrow already exists',
  102: 'Escrow not found',
  103: 'Milestone not found',
  104: 'Milestone already approved',
  105: 'Insufficient funds or balance mismatch',
  106: 'Unauthorized signer',
  107: 'Escrow has expired',
  108: 'Dispute already active',
  109: 'No arbiter assigned to this escrow',
  137: 'Invalid escrow state for requested transition',
  140: 'Invalid milestone status for requested action',
};

const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ||
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? 'https://mainnet.sorobanrpc.com'
    : 'https://soroban-testnet.stellar.org');

export class SorobanSimulator {
  /**
   * Parse fee estimate from simulation response or raw values
   */
  public static parseFee(
    response: any,
    baseFee = 100,
    xlmUsdRate = 0.12,
  ): FeeEstimate {
    let resourceFeeStroops = 0;

    if (response) {
      if (typeof response.minResourceFee !== 'undefined') {
        resourceFeeStroops = Number(response.minResourceFee) || 0;
      } else if (typeof response.resourceFee !== 'undefined') {
        resourceFeeStroops = Number(response.resourceFee) || 0;
      } else if (response.result && typeof response.result.minResourceFee !== 'undefined') {
        resourceFeeStroops = Number(response.result.minResourceFee) || 0;
      }
    }

    const baseFeeStroops = Number(baseFee) || 100;
    const totalStroops = resourceFeeStroops + baseFeeStroops;

    const totalXlmNum = totalStroops / 10_000_000;
    const totalFeeXlm = totalXlmNum.toFixed(7);
    const totalFeeUsd = (totalXlmNum * xlmUsdRate).toFixed(2);

    let cpuInstructions: number | undefined;
    let memoryBytes: number | undefined;

    const cost = response?.cost || response?.result?.cost;
    if (cost) {
      cpuInstructions = Number(cost.cpuInsns) || undefined;
      memoryBytes = Number(cost.memBytes) || undefined;
    }

    return {
      resource_fee: resourceFeeStroops,
      base_fee: baseFeeStroops,
      total_fee_stroops: totalStroops,
      total_fee_xlm: totalFeeXlm,
      total_fee_usd: totalFeeUsd,
      cpu_instructions: cpuInstructions,
      memory_bytes: memoryBytes,
    };
  }

  /**
   * Assess safety risks based on footprint size and fee bounds
   */
  public static assessRisks(
    feeEstimate: FeeEstimate,
    footprintWriteCount: number,
    error?: string,
  ): RiskIndicator[] {
    const risks: RiskIndicator[] = [];

    if (error) {
      risks.push({
        level: 'high',
        type: 'error',
        message: `Transaction will revert: ${error}`,
      });
    }

    // Risk indicator: warn if transaction writes to more than 10 storage keys (large footprint)
    if (footprintWriteCount > 10) {
      risks.push({
        level: 'medium',
        type: 'footprint',
        message: `Large storage footprint: transaction writes to ${footprintWriteCount} storage keys (> 10 keys). Higher ledger rent and fees apply.`,
      });
    }

    // Risk indicator: warn if resource fee exceeds 1 XLM (10,000,000 stroops)
    if (feeEstimate.resource_fee > 10_000_000) {
      risks.push({
        level: 'high',
        type: 'fee',
        message: `High resource fee: estimated resource fee is ${(
          feeEstimate.resource_fee / 10_000_000
        ).toFixed(4)} XLM (> 1.0 XLM threshold).`,
      });
    }

    if (risks.length === 0) {
      risks.push({
        level: 'low',
        type: 'fee',
        message: 'Transaction parameters and storage footprint are within safe standard limits.',
      });
    }

    return risks;
  }

  /**
   * Decode human-readable error messages from simulation responses
   */
  public static extractHumanReadableError(response: any): string | undefined {
    if (!response) return undefined;

    if (response.error) {
      const errStr = typeof response.error === 'string' ? response.error : response.error.message || JSON.stringify(response.error);
      return this.mapErrorCodeToMessage(errStr);
    }

    const result = response.result || response;
    if (result.error) {
      return this.mapErrorCodeToMessage(String(result.error));
    }

    // Check for Soroban invocation error in results
    if (Array.isArray(result.results)) {
      for (const res of result.results) {
        if (res.error) {
          return this.mapErrorCodeToMessage(String(res.error));
        }
      }
    }

    return undefined;
  }

  private static mapErrorCodeToMessage(rawError: string): string {
    // Regex matching "Error(Contract, #137)" or "code: 137"
    const match = rawError.match(/Error\(Contract,\s*#?(\d+)\)/) || rawError.match(/code\s*[:=]\s*(\d+)/);
    if (match && match[1]) {
      const code = parseInt(match[1], 10);
      if (CONTRACT_ERROR_MAP[code]) {
        return `${CONTRACT_ERROR_MAP[code]} (Contract Error #${code})`;
      }
    }

    if (rawError.includes('HostError')) {
      return 'Smart contract execution trapped or panicked on host.';
    }

    return rawError;
  }

  /**
   * Decode state diff into human-readable ledger entries
   */
  public static decodeStateDiff(
    simulationResponse: any,
  ): LedgerEntryDiff[] {
    const diffs: LedgerEntryDiff[] = [];
    if (!simulationResponse) return diffs;

    const txData =
      simulationResponse.transactionData ||
      simulationResponse.result?.transactionData;

    // Check readWrite footprint entries
    let writeEntries: any[] = [];
    if (txData?.resources?.footprint?.readWrite) {
      writeEntries = txData.resources.footprint.readWrite;
    } else if (Array.isArray(simulationResponse.stateChanges)) {
      return simulationResponse.stateChanges.map((sc: any) => ({
        key: sc.key || 'ContractStorage',
        key_type: sc.type || 'Data',
        old_value: this.formatValue(sc.before),
        new_value: this.formatValue(sc.after),
        decoded_type: sc.decoded_type || 'Unknown',
      }));
    }

    for (let i = 0; i < writeEntries.length; i++) {
      const entry = writeEntries[i];
      diffs.push({
        key: typeof entry === 'string' ? `Entry #${i + 1}` : JSON.stringify(entry),
        key_type: 'ContractData',
        old_value: 'Current State',
        new_value: 'Updated (Simulation)',
        decoded_type: 'StorageEntry',
      });
    }

    return diffs;
  }

  /**
   * Helper to format values for state diff display (u128 amounts, EscrowState, MilestoneState)
   */
  public static formatValue(val: any): string {
    if (val === null || val === undefined) return '(empty)';
    if (typeof val === 'object') {
      // Decode EscrowState
      if ('escrow_id' in val || 'total_amount' in val) {
        const id = val.escrow_id ?? 'N/A';
        const total = this.formatAmount(val.total_amount);
        const remaining = this.formatAmount(val.remaining_balance);
        const status = val.status ?? 'Active';
        return `Escrow #${id} | Total: ${total} | Remaining: ${remaining} | Status: ${status}`;
      }

      // Decode MilestoneState / Milestone
      if ('title' in val && ('amount' in val || 'status' in val)) {
        const title = val.title;
        const amount = this.formatAmount(val.amount);
        const status = val.status ?? 'Pending';
        return `Milestone: "${title}" | Amount: ${amount} | Status: ${status}`;
      }

      // Decode u128 / i128 struct
      if ('lo' in val && 'hi' in val) {
        return this.formatAmount(val);
      }

      return JSON.stringify(val);
    }
    return String(val);
  }

  /**
   * Formats raw u128/i128 amounts into human-readable token decimal strings
   */
  public static formatAmount(raw: any, decimals = 7): string {
    if (raw === undefined || raw === null) return '0.00';
    try {
      const b = typeof raw === 'bigint' ? raw : BigInt(raw.toString());
      const divisor = BigInt(10 ** decimals);
      const whole = b / divisor;
      const frac = b % divisor;
      const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
      return `${whole}.${fracStr}`;
    } catch {
      return String(raw);
    }
  }

  /**
   * Derive human-readable action description from method name & args
   */
  public static deriveActionSummary(method: string, args: Record<string, any> = {}): ActionSummary {
    let description = `Executes contract method "${method}"`;

    const normalized = method.toLowerCase();
    if (normalized.includes('create_escrow') || normalized === 'create') {
      description = 'Creates and locks funds into a new milestone escrow between client and freelancer.';
    } else if (normalized.includes('release_milestone') || normalized === 'release') {
      const milestoneId = args.milestone_id ?? args.id ?? 'selected';
      description = `Approves deliverable and releases escrow funds for milestone #${milestoneId}.`;
    } else if (normalized.includes('dispute')) {
      description = 'Opens an on-chain dispute request for arbiter adjudication or mutual settlement.';
    } else if (normalized.includes('cancel_escrow') || normalized === 'cancel') {
      description = 'Cancels active escrow and safely refunds unreleased funds to the client.';
    } else if (normalized.includes('resolve_dispute')) {
      description = 'Finalizes dispute resolution and distributes escrow balance accordingly.';
    }

    return {
      method,
      args,
      description,
    };
  }

  /**
   * Perform client-side simulation on the configured Stellar RPC endpoint
   */
  public static async simulate(
    unsignedXdr: string,
    rpcUrl: string = DEFAULT_RPC_URL,
    options: { baseFee?: number; xlmUsdRate?: number; methodName?: string; args?: Record<string, any> } = {},
  ): Promise<SimulationResult> {
    const baseFee = options.baseFee || 100;
    const xlmUsdRate = options.xlmUsdRate || 0.12;
    const actionSummary = this.deriveActionSummary(options.methodName || 'ContractCall', options.args || {});

    try {
      // Call simulateTransaction via standard JSON-RPC
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'simulateTransaction',
          params: { transaction: unsignedXdr },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errMessage = `RPC HTTP ${response.status}: ${errorText}`;
        const feeEst = this.parseFee(null, baseFee, xlmUsdRate);
        return {
          success: false,
          fee_estimate: feeEst,
          state_diff: [],
          risk_indicators: this.assessRisks(feeEst, 0, errMessage),
          action_summary: actionSummary,
          error: errMessage,
        };
      }

      const json = await response.json();
      const extractedError = this.extractHumanReadableError(json);
      const feeEstimate = this.parseFee(json, baseFee, xlmUsdRate);
      const stateDiff = this.decodeStateDiff(json.result || json);
      const writeCount = stateDiff.length;
      const riskIndicators = this.assessRisks(feeEstimate, writeCount, extractedError);

      return {
        success: !extractedError,
        fee_estimate: feeEstimate,
        state_diff: stateDiff,
        risk_indicators: riskIndicators,
        action_summary: actionSummary,
        error: extractedError,
        raw_response: json,
      };
    } catch (err: any) {
      const errMessage = err?.message || 'Network error communicating with Soroban RPC';
      const feeEst = this.parseFee(null, baseFee, xlmUsdRate);
      return {
        success: false,
        fee_estimate: feeEst,
        state_diff: [],
        risk_indicators: this.assessRisks(feeEst, 0, errMessage),
        action_summary: actionSummary,
        error: errMessage,
      };
    }
  }
}

export default SorobanSimulator;
