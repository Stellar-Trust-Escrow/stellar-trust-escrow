/**
 * Stream Controller
 *
 * REST endpoints for payment stream data. Read endpoints are cached at the
 * route level. The /accrued endpoint queries the contract live (not cached).
 */

import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';
import { xdr, scValToNative } from '@stellar/stellar-sdk';

const STREAMING_CONTRACT_ID = process.env.STREAMING_CONTRACT_ID || '';

// Prisma rows carry BigInt for streamId; JSON.stringify can't serialize BigInt
// natively, so stringify it explicitly before sending, matching the pattern
// used elsewhere in this codebase (see escrowController.js).
function serializeStream(stream) {
  if (!stream) return stream;
  return { ...stream, streamId: stream.streamId?.toString() };
}

// ── Read handlers ─────────────────────────────────────────────────────────────

const listStreams = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const { status, sender, recipient, cursor } = req.query;
    const userAddress = req.user?.walletAddress || req.query.address;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (sender) {
      where.senderAddress = sender;
    } else if (recipient) {
      where.recipientAddress = recipient;
    } else if (userAddress) {
      where.OR = [
        { senderAddress: userAddress },
        { recipientAddress: userAddress },
      ];
    }

    const take = limit + 1;
    const rows = await prisma.paymentStream.findMany({
      where,
      take,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { streamId: BigInt(cursor) } } : {}),
      orderBy: [{ createdAt: 'desc' }, { streamId: 'desc' }],
    });

    const hasMore = rows.length > limit;
    const rowsPage = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(rowsPage[rowsPage.length - 1].streamId) : null;
    const data = rowsPage.map(serializeStream);

    res.json({ data, pagination: { limit, nextCursor } });
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid stream id' });
    }
    logControllerError('stream.listStreams', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getStream = async (req, res) => {
  try {
    const streamId = BigInt(req.params.streamId);

    const stream = await prisma.paymentStream.findUnique({
      where: { streamId },
    });

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    res.json(serializeStream(stream));
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid stream id' });
    }
    logControllerError('stream.getStream', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getAccrued = async (req, res) => {
  try {
    const streamId = BigInt(req.params.streamId);

    if (!STREAMING_CONTRACT_ID) {
      return res.status(503).json({ error: 'Streaming contract not configured' });
    }

    // Query the contract directly for the live accrued amount
    const { SorobanRpc, Contract, Address, nativeToScVal, BASE_FEE } = await import(
      '@stellar/stellar-sdk'
    );

    const server = new SorobanRpc.Server(
      process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    );

    const contract = new Contract(STREAMING_CONTRACT_ID);
    const dummyAccount = new (await import('@stellar/stellar-sdk')).Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAV',
      '0',
    );

    const { TransactionBuilder } = await import('@stellar/stellar-sdk');
    const networkPassphrase =
      process.env.STELLAR_NETWORK === 'mainnet'
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015';

    const tx = new TransactionBuilder(dummyAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call('accrued', nativeToScVal(streamId, { type: 'u64' })))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(tx);

    if (SorobanRpc.isSimulationError(simulation)) {
      return res.status(502).json({ error: 'Contract simulation failed', detail: simulation.error });
    }

    let accrued = 0;
    if (simulation.result?.retval) {
      const native = scValToNative(simulation.result.retval);
      accrued = typeof native === 'bigint' ? native : BigInt(String(native));
    }

    res.json({ streamId: streamId.toString(), accrued: accrued.toString() });
  } catch (err) {
    logControllerError('stream.getAccrued', err, req);
    res.status(500).json({ error: err.message });
  }
};

const buildClaimXdr = async (req, res) => {
  try {
    const streamId = BigInt(req.params.streamId);
    const { recipientAddress } = req.body;

    if (!recipientAddress) {
      return res.status(400).json({ error: 'recipientAddress is required' });
    }

    if (!STREAMING_CONTRACT_ID) {
      return res.status(503).json({ error: 'Streaming contract not configured' });
    }

    const {
      SorobanRpc,
      Contract,
      Address,
      nativeToScVal,
      TransactionBuilder,
      BASE_FEE,
    } = await import('@stellar/stellar-sdk');

    const server = new SorobanRpc.Server(
      process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    );

    const networkPassphrase =
      process.env.STELLAR_NETWORK === 'mainnet'
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015';

    const account = await server.getAccount(recipientAddress);
    const contract = new Contract(STREAMING_CONTRACT_ID);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        contract.call(
          'claim',
          new Address(recipientAddress).toScVal(),
          nativeToScVal(streamId, { type: 'u64' }),
        ),
      )
      .setTimeout(300)
      .build();

    const prepared = await server.simulateTransaction(tx);

    if (SorobanRpc.isSimulationError(prepared)) {
      return res.status(422).json({
        error: 'Simulation failed',
        detail: prepared.error,
      });
    }

    const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
    const unsignedXdr = assembled.toXDR('base64');

    res.json({ unsignedXdr, streamId: streamId.toString() });
  } catch (err) {
    logControllerError('stream.buildClaimXdr', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default {
  listStreams,
  getStream,
  getAccrued,
  buildClaimXdr,
};
