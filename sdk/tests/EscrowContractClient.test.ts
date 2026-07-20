import { jest } from '@jest/globals';

// Mock invokeContract so tests don't hit a real RPC
const mockInvoke = jest.fn();
jest.mock('../src/txBuilder.js', () => ({ invokeContract: mockInvoke }));

import { EscrowContractClient } from '../src/generated/EscrowContractClient.js';
import { createSecretKeySigner } from '../src/signers/secretKeySigner.js';
import { Keypair } from '@stellar/stellar-sdk';

const keypair = Keypair.random();
const config = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  signer: createSecretKeySigner(keypair.secret()),
};

const client = new EscrowContractClient(config);

describe('EscrowContractClient', () => {
  beforeEach(() => mockInvoke.mockClear());

  it('createEscrow calls invokeContract with correct method', async () => {
    mockInvoke.mockResolvedValue({ txHash: 'abc', result: 1n, ledger: 100 });

    const result = await client.createEscrow({
      caller: keypair.publicKey(),
      freelancer: Keypair.random().publicKey(),
      token: Keypair.random().publicKey(),
      totalAmount: 1000n,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [, method, args] = mockInvoke.mock.calls[0] as [unknown, string, unknown[]];
    expect(method).toBe('create_escrow');
    expect(args).toHaveLength(4);
    expect(result.txHash).toBe('abc');
    expect(result.result).toBe(1n);
  });

  it('approveMilestone passes correct method name', async () => {
    mockInvoke.mockResolvedValue({ txHash: 'def', result: null, ledger: 101 });

    await client.approveMilestone({ caller: keypair.publicKey(), escrowId: 1n, milestoneId: 0 });

    const [, method] = mockInvoke.mock.calls[0] as [unknown, string];
    expect(method).toBe('approve_milestone');
  });

  it('cancelEscrow passes correct arguments count', async () => {
    mockInvoke.mockResolvedValue({ txHash: 'ghi', result: null, ledger: 102 });

    await client.cancelEscrow({ caller: keypair.publicKey(), escrowId: 5n });

    const [, , args] = mockInvoke.mock.calls[0] as [unknown, string, unknown[]];
    expect(args).toHaveLength(2);
  });
});
