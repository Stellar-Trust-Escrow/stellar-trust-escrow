import {
  SorobanSimulator,
  FeeEstimate,
  LedgerEntryDiff,
} from '../../lib/soroban-simulator';

describe('SorobanSimulator', () => {
  describe('parseFee', () => {
    it('should correctly parse resourceFee and baseFee into 7-decimal XLM and 2-decimal USD', () => {
      const response = {
        minResourceFee: '1500000', // 0.15 XLM
        cost: {
          cpuInsns: '1200000',
          memBytes: '45000',
        },
      };

      const baseFee = 200; // 200 stroops
      const rate = 0.15; // $0.15 per XLM

      const estimate = SorobanSimulator.parseFee(response, baseFee, rate);

      expect(estimate.resource_fee).toBe(1500000);
      expect(estimate.base_fee).toBe(200);
      expect(estimate.total_fee_stroops).toBe(1500200);
      // 1500200 / 10,000,000 = 0.1500200 XLM
      expect(estimate.total_fee_xlm).toBe('0.1500200');
      // 0.15002 * 0.15 = 0.0225 -> '0.02'
      expect(estimate.total_fee_usd).toBe('0.02');
      expect(estimate.cpu_instructions).toBe(1200000);
      expect(estimate.memory_bytes).toBe(45000);
    });

    it('should handle zero resource fee with default values', () => {
      const estimate = SorobanSimulator.parseFee(null, 100, 0.10);

      expect(estimate.resource_fee).toBe(0);
      expect(estimate.base_fee).toBe(100);
      expect(estimate.total_fee_xlm).toBe('0.0000100');
      expect(estimate.total_fee_usd).toBe('0.00');
    });
  });

  describe('assessRisks', () => {
    it('should flag high fee when resource fee exceeds 1 XLM (10,000,000 stroops)', () => {
      const highFee: FeeEstimate = {
        resource_fee: 15_000_000,
        base_fee: 100,
        total_fee_stroops: 15_000_100,
        total_fee_xlm: '1.5000100',
        total_fee_usd: '0.18',
      };

      const risks = SorobanSimulator.assessRisks(highFee, 4);

      expect(risks.some((r) => r.level === 'high' && r.type === 'fee')).toBe(true);
      const feeRisk = risks.find((r) => r.type === 'fee');
      expect(feeRisk?.message).toContain('> 1.0 XLM threshold');
    });

    it('should flag medium risk when footprint writes to more than 10 storage keys', () => {
      const normalFee: FeeEstimate = {
        resource_fee: 50_000,
        base_fee: 100,
        total_fee_stroops: 50_100,
        total_fee_xlm: '0.0050100',
        total_fee_usd: '0.01',
      };

      const risks = SorobanSimulator.assessRisks(normalFee, 14);

      expect(risks.some((r) => r.level === 'medium' && r.type === 'footprint')).toBe(true);
      const footprintRisk = risks.find((r) => r.type === 'footprint');
      expect(footprintRisk?.message).toContain('14 storage keys (> 10 keys)');
    });

    it('should return safe low risk for standard parameters', () => {
      const normalFee: FeeEstimate = {
        resource_fee: 25_000,
        base_fee: 100,
        total_fee_stroops: 25_100,
        total_fee_xlm: '0.0025100',
        total_fee_usd: '0.00',
      };

      const risks = SorobanSimulator.assessRisks(normalFee, 3);

      expect(risks.length).toBe(1);
      expect(risks[0].level).toBe('low');
    });
  });

  describe('extractHumanReadableError', () => {
    it('should map Error(Contract, #137) to InvalidEscrowState', () => {
      const resp = {
        error: 'HostError: Error(Contract, #137) in method call',
      };

      const humanError = SorobanSimulator.extractHumanReadableError(resp);
      expect(humanError).toContain('Invalid escrow state for requested transition');
      expect(humanError).toContain('Contract Error #137');
    });

    it('should map Error(Contract, #1) to Unauthorized caller', () => {
      const resp = {
        result: {
          results: [{ error: 'Error(Contract, #1)' }],
        },
      };

      const humanError = SorobanSimulator.extractHumanReadableError(resp);
      expect(humanError).toContain('Unauthorized caller');
    });

    it('should map generic HostError into friendly message', () => {
      const resp = {
        error: 'HostError: panic occurred in contract',
      };

      const humanError = SorobanSimulator.extractHumanReadableError(resp);
      expect(humanError).toBe('Smart contract execution trapped or panicked on host.');
    });
  });

  describe('formatValue and decoding', () => {
    it('should decode EscrowState into human-readable representation', () => {
      const escrowState = {
        escrow_id: 42,
        total_amount: 100000000, // 10 XLM
        remaining_balance: 50000000, // 5 XLM
        status: 'Active',
      };

      const decoded = SorobanSimulator.formatValue(escrowState);

      expect(decoded).toContain('Escrow #42');
      expect(decoded).toContain('Total: 10.0000');
      expect(decoded).toContain('Remaining: 5.0000');
      expect(decoded).toContain('Status: Active');
    });

    it('should decode MilestoneState into human-readable deliverable representation', () => {
      const milestone = {
        title: 'Initial Smart Contract Architecture',
        amount: 25000000, // 2.5 XLM
        status: 'Approved',
      };

      const decoded = SorobanSimulator.formatValue(milestone);

      expect(decoded).toContain('Milestone: "Initial Smart Contract Architecture"');
      expect(decoded).toContain('Amount: 2.5000');
      expect(decoded).toContain('Status: Approved');
    });

    it('should decode u128 token amounts correctly with decimals', () => {
      expect(SorobanSimulator.formatAmount(50000000, 7)).toBe('5.0000');
      expect(SorobanSimulator.formatAmount('10000000000', 7)).toBe('1000.0000');
    });
  });

  describe('deriveActionSummary', () => {
    it('should derive friendly description for create_escrow', () => {
      const summary = SorobanSimulator.deriveActionSummary('create_escrow');
      expect(summary.description).toContain('Creates and locks funds');
    });

    it('should derive friendly description for release_milestone', () => {
      const summary = SorobanSimulator.deriveActionSummary('release_milestone', { milestone_id: 1 });
      expect(summary.description).toContain('milestone #1');
    });

    it('should derive friendly description for dispute', () => {
      const summary = SorobanSimulator.deriveActionSummary('dispute');
      expect(summary.description).toContain('dispute request');
    });
  });
});
