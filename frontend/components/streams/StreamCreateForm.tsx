'use client';

import { useState, useMemo } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const RATE_PRECISION = 10_000_000;

const COMMON_TOKENS = [
  { label: 'USDC', address: 'GA5ZSEJYB37JDD5G4LYQCI7ADR7YLFGRMHEZ2EWWGISFCCBOJH2O2UA7' },
  { label: 'XLM', address: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVSNYHQ2WTHASPFTKEJ7ICIRXXWJ' },
];

function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) return 'N/A';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (parts.length === 0) {
    const mins = Math.ceil(totalSeconds / 60);
    parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`);
  }
  return parts.join(' ');
}

interface StreamCreateFormProps {
  onCreated?: () => void;
}

export default function StreamCreateForm({ onCreated }: StreamCreateFormProps) {
  const [recipient, setRecipient] = useState('');
  const [tokenAddress, setTokenAddress] = useState(COMMON_TOKENS[0].address);
  const [totalAmount, setTotalAmount] = useState('');
  const [ratePerHour, setRatePerHour] = useState('');
  const [startAt, setStartAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ratePerSecond = useMemo(() => {
    const perHour = parseFloat(ratePerHour);
    if (!perHour || perHour <= 0) return null;
    return Math.round((perHour / 3600) * RATE_PRECISION);
  }, [ratePerHour]);

  const duration = useMemo(() => {
    const amount = parseFloat(totalAmount);
    const rate = parseFloat(ratePerHour);
    if (!amount || !rate || rate <= 0) return null;
    return (amount / rate) * 3600;
  }, [totalAmount, ratePerHour]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const sdk: any = await import('@stellar/stellar-sdk');
      const {
        SorobanRpc,
        TransactionBuilder,
        Contract,
        Address,
        nativeToScVal,
        BASE_FEE,
      } = sdk;
      const { signWithFreighter } = await import('../../lib/soroban');

      const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
      const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
      const CONTRACT = process.env.NEXT_PUBLIC_STREAMING_CONTRACT_ADDRESS || '';
      const PASSPHRASE =
        NETWORK === 'mainnet'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015';

      if (!CONTRACT) throw new Error('Streaming contract address not configured');
      if (!ratePerSecond) throw new Error('Invalid rate');

      const server = new SorobanRpc.Server(RPC_URL);
      const { getPublicKey } = await import('@stellar/freighter-api');
      const address = await getPublicKey();
      const account = await server.getAccount(address);
      const contract = new Contract(CONTRACT);

      const bigTotal = BigInt(Math.round(parseFloat(totalAmount) * RATE_PRECISION));
      const bigRate = BigInt(ratePerSecond);
      const startTs = startAt
        ? BigInt(Math.floor(new Date(startAt).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000));

      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
        .addOperation(
          contract.call(
            'create_stream',
            new Address(address).toScVal(),
            new Address(recipient).toScVal(),
            new Address(tokenAddress).toScVal(),
            nativeToScVal(bigTotal, { type: 'i128' }),
            nativeToScVal(bigRate, { type: 'i128' }),
            nativeToScVal(startTs, { type: 'u64' }),
          ),
        )
        .setTimeout(300)
        .build();

      const prepared = await server.simulateTransaction(tx);
      if (SorobanRpc.isSimulationError(prepared)) {
        throw new Error(`Simulation failed: ${prepared.error}`);
      }
      const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
      const signed = await signWithFreighter(assembled.toXDR('base64'));

      const res = await fetch(`${API_URL}/api/escrows/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Broadcast failed');
      }

      setRecipient('');
      setTotalAmount('');
      setRatePerHour('');
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <h3 className="text-lg font-semibold text-white">Create Payment Stream</h3>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-1">Recipient Address</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="G..."
          required
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Token</label>
        <select
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {COMMON_TOKENS.map((t) => (
            <option key={t.address} value={t.address}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Total Amount</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="10000"
            required
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Rate (tokens/hour)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={ratePerHour}
            onChange={(e) => setRatePerHour(e.target.value)}
            placeholder="50"
            required
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Start Date/Time (optional)</label>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {duration !== null && (
        <p className="text-sm text-gray-400">
          At this rate, funds will run out in{' '}
          <span className="text-indigo-400 font-medium">{formatDuration(duration)}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !recipient || !totalAmount || !ratePerHour}
        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
      >
        {loading ? 'Creating stream...' : 'Create Stream'}
      </button>
    </form>
  );
}
