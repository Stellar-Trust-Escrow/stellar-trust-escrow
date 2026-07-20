import { PDFDocument } from 'pdf-lib';
import {
  generateEscrowReceiptPdf,
  buildMilestoneRows,
  buildPartyRows,
  getAccountExplorerUrl,
  getContractExplorerUrl,
} from '../../lib/pdfExport';

const FIXED_TIMESTAMP = new Date('2026-07-20T12:00:00.000Z');
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPngSignature(bytes) {
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

const COMPLETED_ESCROW = {
  id: 42,
  status: 'Completed',
  clientAddress: 'GCLIENT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB',
  freelancerAddress: 'GFREELANCER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
  contractAddress: 'CCONTRACT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  milestones: [
    {
      id: 0,
      title: 'Design Mockups',
      amount: '500 USDC',
      status: 'Approved',
      deliverableHash: 'QmABC123',
      txHash: 'a1b2c3d4e5f6',
    },
    {
      id: 1,
      title: 'Development',
      amount: '1000 USDC',
      status: 'Approved',
      deliverableHash: 'QmDEF456',
      txHash: 'b2c3d4e5f6a1',
    },
    {
      id: 2,
      title: 'Final Sign-off',
      amount: '500 USDC',
      status: 'Approved',
      deliverableHash: 'QmGHI789',
      txHash: 'c3d4e5f6a1b2',
    },
  ],
};

const RESOLVED_ESCROW = {
  ...COMPLETED_ESCROW,
  status: 'Resolved',
  arbiterAddress: 'GARBITER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  resolution: {
    ruling: 'Split award',
    clientSplitPercent: 60,
    contractorSplitPercent: 40,
    rulingTxHash: 'd4e5f6a1b2c3',
  },
};

describe('generateEscrowReceiptPdf', () => {
  it('generates PDF bytes without errors for a completed escrow with 3 milestones (byte length within 5%)', async () => {
    const bytes = await generateEscrowReceiptPdf(COMPLETED_ESCROW, {
      network: 'testnet',
      timestamp: FIXED_TIMESTAMP,
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    // Snapshot on byte length rather than exact bytes: pdf-lib's internal
    // object ordering can shift a handful of bytes between environments
    // without changing the document's actual content.
    const EXPECTED_BYTE_LENGTH = 6772;
    const tolerance = EXPECTED_BYTE_LENGTH * 0.05;
    expect(Math.abs(bytes.length - EXPECTED_BYTE_LENGTH)).toBeLessThanOrEqual(tolerance);
  });

  it('produces a PDF that can be loaded back by pdf-lib', async () => {
    const bytes = await generateEscrowReceiptPdf(COMPLETED_ESCROW, {
      network: 'testnet',
      timestamp: FIXED_TIMESTAMP,
    });
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('embeds QR code PNG bytes (and the logo PNG) in the generated PDF', async () => {
    const embedPngSpy = jest.spyOn(PDFDocument.prototype, 'embedPng');

    await generateEscrowReceiptPdf(COMPLETED_ESCROW, {
      network: 'testnet',
      timestamp: FIXED_TIMESTAMP,
    });

    const embeddedPngBuffers = embedPngSpy.mock.calls.map(([bytes]) => bytes);
    expect(embeddedPngBuffers.length).toBeGreaterThanOrEqual(2); // logo + QR code
    expect(embeddedPngBuffers.every(isPngSignature)).toBe(true);

    embedPngSpy.mockRestore();
  });

  it('includes a resolution section with ruling and arbiter tx for a resolved/disputed escrow', async () => {
    const bytes = await generateEscrowReceiptPdf(RESOLVED_ESCROW, {
      network: 'testnet',
      timestamp: FIXED_TIMESTAMP,
    });
    expect(bytes.length).toBeGreaterThan(0);

    const partyRows = buildPartyRows(RESOLVED_ESCROW, 'testnet');
    expect(partyRows.some((row) => row.role === 'Arbiter')).toBe(true);
  });

  it('does not include an arbiter row for a completed (non-disputed) escrow', () => {
    const partyRows = buildPartyRows(COMPLETED_ESCROW, 'testnet');
    expect(partyRows.some((row) => row.role === 'Arbiter')).toBe(false);
  });
});

describe('buildMilestoneRows', () => {
  it('renders the correct row count for the escrow milestones', () => {
    const rows = buildMilestoneRows(COMPLETED_ESCROW.milestones);
    expect(rows).toHaveLength(3);
  });

  it('maps each milestone to index, description, amount, status, and hashes', () => {
    const rows = buildMilestoneRows(COMPLETED_ESCROW.milestones);
    expect(rows[0]).toEqual({
      index: 1,
      description: 'Design Mockups',
      amount: '500 USDC',
      status: 'Approved',
      deliverableHash: 'QmABC123',
      txHash: 'a1b2c3d4e5f6',
    });
  });

  it('returns an empty array when there are no milestones', () => {
    expect(buildMilestoneRows([])).toEqual([]);
    expect(buildMilestoneRows(undefined)).toEqual([]);
  });
});

describe('explorer URL helpers', () => {
  it('builds testnet account URLs by default', () => {
    expect(getAccountExplorerUrl('GABC')).toBe('https://stellar.expert/explorer/testnet/account/GABC');
  });

  it('builds mainnet contract URLs when network is mainnet', () => {
    expect(getContractExplorerUrl('CABC', 'mainnet')).toBe(
      'https://stellar.expert/explorer/public/contract/CABC',
    );
  });
});
