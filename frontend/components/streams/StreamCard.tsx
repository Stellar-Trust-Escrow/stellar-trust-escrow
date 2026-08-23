'use client';

import { useState } from 'react';
import { useStreamAccrual } from '../../hooks/useStreamAccrual';
import { cn } from '../../lib/utils';
import { truncateAddress } from '../../lib/stellar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const RATE_PRECISION = 10_000_000;

function formatTokenAmount(amount: string | number, decimals = 7) {
  const num = Number(amount);
  if (!num) return '0';
  const formatted = num / RATE_PRECISION;
  return formatted.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatRate(ratePerSecond: string | number) {
  const num = Number(ratePerSecond);
  if (!num) return '0';
  const tokensPerSec = num / RATE_PRECISION;
  if (tokensPerSec < 0.001) return `${(tokensPerSec * 3600).toFixed(2)} tok/hr`;
  if (tokensPerSec < 1) return `${tokensPerSec.toFixed(4)} tok/sec`;
  return `${tokensPerSec.toFixed(2)} tok/sec`;
}

interface Stream {
  streamId: string | number;
  senderAddress: string;
  recipientAddress: string;
  status: string;
  ratePerSecond: string | number;
  totalAmount: string | number;
  remainingBalance: string | number;
  startAt: string | number;
  lastClaimedAt?: string | number;
  paused?: boolean;
}

interface StreamCardProps {
  stream: Stream;
  role: 'sender' | 'recipient';
  onAction?: () => void;
}

export default function StreamCard({ stream, role, onAction }: StreamCardProps) {
  const { accrued, progress } = useStreamAccrual(stream);
  const [loading, setLoading] = useState(false);
  const isSender = role === 'sender';
  const recipient = stream.recipientAddress;
  const sender = stream.senderAddress;

  const handleClaim = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/streams/${stream.streamId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientAddress: recipient }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { signWithFreighter } = await import('../../lib/soroban');
      const signed = await signWithFreighter(data.unsignedXdr);

      const submitRes = await fetch(`${API_URL}/api/escrows/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });
      if (!submitRes.ok) throw new Error('Submission failed');

      onAction?.();
    } catch (err) {
      console.error('Claim failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    setLoading(true);
    try {
      const { signWithFreighter } = await import('../../lib/soroban');
      const sdk: any = await import('@stellar/stellar-sdk');
      const { SorobanRpc, TransactionBuilder, Contract, Address, nativeToScVal, BASE_FEE } = sdk;

      const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
      const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
      const CONTRACT = process.env.NEXT_PUBLIC_STREAMING_CONTRACT_ADDRESS || '';
      const PASSPHRASE =
        NETWORK === 'mainnet'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015';

      const server = new SorobanRpc.Server(RPC_URL);
      const account = await server.getAccount(sender);
      const contract = new Contract(CONTRACT);

      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
        .addOperation(
          contract.call(
            'pause',
            new Address(sender).toScVal(),
            nativeToScVal(BigInt(stream.streamId), { type: 'u64' }),
          ),
        )
        .setTimeout(300)
        .build();

      const prepared = await server.simulateTransaction(tx);
      if (SorobanRpc.isSimulationError(prepared)) throw new Error(prepared.error);
      const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
      const signed = await signWithFreighter(assembled.toXDR('base64'));

      await fetch(`${API_URL}/api/escrows/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });

      onAction?.();
    } catch (err) {
      console.error('Pause failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const { signWithFreighter } = await import('../../lib/soroban');
      const sdk: any = await import('@stellar/stellar-sdk');
      const { SorobanRpc, TransactionBuilder, Contract, Address, nativeToScVal, BASE_FEE } = sdk;

      const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
      const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
      const CONTRACT = process.env.NEXT_PUBLIC_STREAMING_CONTRACT_ADDRESS || '';
      const PASSPHRASE =
        NETWORK === 'mainnet'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015';

      const server = new SorobanRpc.Server(RPC_URL);
      const account = await server.getAccount(sender);
      const contract = new Contract(CONTRACT);

      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
        .addOperation(
          contract.call(
            'cancel',
            new Address(sender).toScVal(),
            nativeToScVal(BigInt(stream.streamId), { type: 'u64' }),
          ),
        )
        .setTimeout(300)
        .build();

      const prepared = await server.simulateTransaction(tx);
      if (SorobanRpc.isSimulationError(prepared)) throw new Error(prepared.error);
      const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
      const signed = await signWithFreighter(assembled.toXDR('base64'));

      await fetch(`${API_URL}/api/escrows/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });

      onAction?.();
    } catch (err) {
      console.error('Cancel failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusColor: Record<string, string> = {
    Active: 'text-emerald-400 bg-emerald-400/10',
    Paused: 'text-yellow-400 bg-yellow-400/10',
    Completed: 'text-gray-400 bg-gray-400/10',
    Cancelled: 'text-red-400 bg-red-400/10',
  };

  return (
    <div className="card p-4 mb-3 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-1">
            {isSender ? 'To:' : 'From:'}{' '}
            <span className="font-mono text-gray-300">
              {truncateAddress(isSender ? recipient : sender)}
            </span>
          </p>
          <p className="text-xs text-gray-500">
            Stream #{stream.streamId.toString()}
          </p>
        </div>
        <span className={cn('text-xs font-medium px-2 py-1 rounded-full', statusColor[stream.status] || 'text-gray-400')}>
          {stream.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        <div>
          <span className="text-gray-500 text-xs block">Rate</span>
          <span className="text-white">{formatRate(stream.ratePerSecond)}</span>
        </div>
        <div>
          <span className="text-gray-500 text-xs block">Accrued</span>
          <span className="text-emerald-400 font-mono">{accrued}</span>
        </div>
        <div>
          <span className="text-gray-500 text-xs block">Total</span>
          <span className="text-gray-300">{formatTokenAmount(stream.totalAmount)}</span>
        </div>
        <div>
          <span className="text-gray-500 text-xs block">Remaining</span>
          <span className="text-gray-300">{formatTokenAmount(stream.remainingBalance || stream.totalAmount)}</span>
        </div>
      </div>

      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex gap-2">
        {!isSender && stream.status === 'Active' && (
          <button
            onClick={handleClaim}
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
          >
            {loading ? 'Processing...' : 'Claim now'}
          </button>
        )}
        {isSender && stream.status === 'Active' && (
          <>
            <button
              onClick={handlePause}
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 border border-yellow-600/30 disabled:opacity-50 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
