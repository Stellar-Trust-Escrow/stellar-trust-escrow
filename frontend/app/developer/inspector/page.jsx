'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';

const DEFAULT_ABI = [
  {
    name: 'get_escrow',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrow_id', type: 'u32' }],
    outputs: [{ name: 'escrow', type: 'map' }],
  },
  {
    name: 'approve_milestone',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrow_id', type: 'u32' },
      { name: 'milestone_id', type: 'u32' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [{ name: 'result', type: 'bool' }],
  },
];

function parseAbi(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.functions && Array.isArray(parsed.functions)) return parsed.functions;
    return [];
  } catch {
    return [];
  }
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function coerceInput(value, type) {
  if (type?.toLowerCase().includes('bool')) {
    return value === 'true';
  }
  if (/^(u?int|i?64|u?32|u?16|u?8)$/.test(type.toLowerCase())) {
    return Number(value);
  }
  if (type?.toLowerCase().includes('array') || type?.toLowerCase().includes('vec')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.split(',').map((item) => item.trim());
    }
  }
  return value;
}

function isReadOnly(fn) {
  return fn?.stateMutability === 'view' || fn?.stateMutability === 'pure';
}

export default function ContractInspectorPage() {
  const [abiText, setAbiText] = useState(JSON.stringify(DEFAULT_ABI, null, 2));
  const [contractId, setContractId] = useState(
    'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  );
  const [rpcUrl, setRpcUrl] = useState('https://horizon-testnet.stellar.org/soroban/rpc');
  const [selectedFunctionIndex, setSelectedFunctionIndex] = useState(0);
  const [fieldValues, setFieldValues] = useState({});
  const [responsePayload, setResponsePayload] = useState(null);
  const [transactionLog, setTransactionLog] = useState(null);
  const [gasMetrics, setGasMetrics] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletNetwork, setWalletNetwork] = useState(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [abiError, setAbiError] = useState('');
  const [invokeError, setInvokeError] = useState('');
  const [isInvoking, setIsInvoking] = useState(false);

  const functions = useMemo(() => {
    const entries = parseAbi(abiText);
    if (entries.length === 0) return [];
    return entries.filter((fn) => fn?.name && fn?.type === 'function');
  }, [abiText]);

  const activeFunction = functions[selectedFunctionIndex] ?? null;

  useEffect(() => {
    if (functions.length === 0) return;
    if (selectedFunctionIndex >= functions.length) {
      setSelectedFunctionIndex(0);
    }
  }, [functions, selectedFunctionIndex]);

  useEffect(() => {
    try {
      parseAbi(abiText);
      setAbiError('');
    } catch (error) {
      setAbiError(error.message || 'Unable to parse ABI JSON.');
    }
  }, [abiText]);

  useEffect(() => {
    const loadWallet = async () => {
      if (typeof window === 'undefined' || !window.freighter) return;
      try {
        if (typeof window.freighter.isConnected === 'function') {
          const connected = await window.freighter.isConnected();
          if (connected && typeof window.freighter.getPublicKey === 'function') {
            const address = await window.freighter.getPublicKey();
            setWalletAddress(address);
          }
          if (connected && typeof window.freighter.getNetworkDetails === 'function') {
            const network = await window.freighter.getNetworkDetails();
            setWalletNetwork(network?.name || network?.network || 'unknown');
          }
        }
      } catch {
        // ignore
      }
    };
    loadWallet();
  }, []);

  const handleWalletConnect = async () => {
    if (typeof window === 'undefined' || !window.freighter) {
      setInvokeError('Freighter wallet is not installed.');
      return;
    }

    setConnectingWallet(true);
    setInvokeError('');

    try {
      if (typeof window.freighter.request === 'function') {
        await window.freighter.request({ method: 'requestAccount' });
      }
      if (typeof window.freighter.requestAccess === 'function') {
        await window.freighter.requestAccess();
      }
      const address =
        (typeof window.freighter.getPublicKey === 'function' &&
          (await window.freighter.getPublicKey())) ||
        null;
      const networkDetails =
        (typeof window.freighter.getNetworkDetails === 'function' &&
          (await window.freighter.getNetworkDetails())) ||
        null;
      setWalletAddress(address);
      setWalletNetwork(networkDetails?.name || networkDetails?.network || 'unknown');
    } catch (error) {
      setInvokeError(error?.message || 'Unable to connect wallet.');
    } finally {
      setConnectingWallet(false);
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setFieldValues((current) => ({ ...current, [fieldName]: value }));
  };

  const estimateGas = (fn) => {
    if (!fn) return { estimated: 0, charged: 0 };
    const base = isReadOnly(fn) ? 70 : 450;
    const variable = (fn.inputs?.length || 0) * 45;
    return { estimated: base + variable, charged: Math.max(base, base + variable - 40) };
  };

  const buildTransactionLog = (fn, args, signedXdr) => ({
    method: fn?.name || 'unknown',
    contractId,
    timestamp: new Date().toISOString(),
    args,
    signedXdr: signedXdr || 'n/a',
    status: walletAddress ? 'ready' : 'preview',
  });

  const handleInvoke = async () => {
    if (!activeFunction) {
      setInvokeError('Select a function before invoking.');
      return;
    }
    if (!contractId) {
      setInvokeError('Contract ID is required.');
      return;
    }
    if (!walletAddress) {
      setInvokeError('Please connect your Freighter wallet before invoking a contract method.');
      return;
    }

    setInvokeError('');
    setIsInvoking(true);
    try {
      const args = {};
      (activeFunction.inputs || []).forEach((input) => {
        args[input.name] = coerceInput(fieldValues[input.name] ?? '', input.type);
      });

      const unsignedPayload = {
        contractId,
        function: activeFunction.name,
        inputs: args,
        rpcUrl,
      };

      const signedXdr =
        typeof window.freighter?.signTransaction === 'function'
          ? await window.freighter.signTransaction(JSON.stringify(unsignedPayload), {
              networkPassphrase: walletNetwork || 'Test SDF Network ; September 2015',
              accountToSign: walletAddress,
            })
          : null;

      const result = {
        confirmedAt: new Date().toISOString(),
        request: unsignedPayload,
        simulatedResponse: {
          outcome: isReadOnly(activeFunction) ? 'read' : 'write',
          rawResult: { success: true, data: args },
          gas: estimateGas(activeFunction),
          wallet: { address: walletAddress, network: walletNetwork },
        },
      };

      setGasMetrics(estimateGas(activeFunction));
      setTransactionLog(buildTransactionLog(activeFunction, args, signedXdr));
      setResponsePayload(result);
    } catch (error) {
      setInvokeError(error?.message || 'Invocation failed.');
    } finally {
      setIsInvoking(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-white">Smart Contract Method Inspector</h1>
          <p className="text-gray-400 max-w-2xl">
            Inspect Soroban ABI functions, connect your wallet, and execute raw contract methods
            with dynamic input forms.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            size="md"
            onClick={handleWalletConnect}
            isLoading={connectingWallet}
          >
            {walletAddress ? 'Wallet Connected' : 'Connect Wallet'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setAbiText(JSON.stringify(DEFAULT_ABI, null, 2));
              setSelectedFunctionIndex(0);
              setFieldValues({});
              setInvokeError('');
            }}
          >
            Load Sample ABI
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <div className="card p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">ABI Inspector</h2>
            <label className="block text-sm font-medium text-gray-300">
              Contract ABI JSON
              <textarea
                rows={12}
                value={abiText}
                onChange={(event) => setAbiText(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-gray-700 bg-slate-950 px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            {abiError && <p className="text-sm text-amber-300">{abiError}</p>}
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Contract Configuration</h2>
            <label className="block text-sm font-medium text-gray-300">
              Soroban RPC URL
              <input
                type="url"
                value={rpcUrl}
                onChange={(event) => setRpcUrl(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-gray-700 bg-slate-950 px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="https://horizon-testnet.stellar.org/soroban/rpc"
              />
            </label>
            <label className="block text-sm font-medium text-gray-300">
              Contract ID
              <input
                type="text"
                value={contractId}
                onChange={(event) => setContractId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-gray-700 bg-slate-950 px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="G..."
              />
            </label>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white">Wallet Status</h2>
            <div className="mt-4 space-y-2 text-sm text-gray-300">
              <p>
                <strong>Address:</strong> {walletAddress ?? 'Not connected'}
              </p>
              <p>
                <strong>Network:</strong> {walletNetwork ?? 'Unknown'}
              </p>
              <p>
                <strong>Connection:</strong> {walletAddress ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white">ABI Methods</h2>
            {functions.length === 0 ? (
              <p className="mt-4 text-sm text-gray-400">
                No functions detected. Paste a Soroban ABI and select a method.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {functions.map((fn, index) => (
                  <button
                    key={fn.name + index}
                    type="button"
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition-all ${
                      index === selectedFunctionIndex
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-gray-700 bg-slate-950 text-gray-300 hover:border-indigo-400'
                    }`}
                    onClick={() => {
                      setSelectedFunctionIndex(index);
                      setFieldValues({});
                    }}
                  >
                    <div className="font-medium">{fn.name}</div>
                    <div className="text-xs text-gray-400">
                      {fn.stateMutability || 'nonpayable'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {activeFunction && (
        <div className="card p-6 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Invoke {activeFunction.name}</h2>
              <p className="text-sm text-gray-400">
                Dynamic inputs are generated from the ABI definition.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <span className="rounded-full bg-gray-800 px-3 py-1 text-xs uppercase tracking-[0.12em] text-indigo-300">
                {activeFunction.inputs?.length ?? 0} inputs
              </span>
              <span className="rounded-full bg-gray-800 px-3 py-1 text-xs uppercase tracking-[0.12em] text-emerald-300">
                {isReadOnly(activeFunction) ? 'read-only' : 'transaction'}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(activeFunction.inputs || []).map((input) => (
              <label key={input.name} className="block text-sm text-gray-300">
                {input.name} <span className="text-xs text-gray-500">({input.type})</span>
                <input
                  type="text"
                  value={fieldValues[input.name] ?? ''}
                  onChange={(event) => handleFieldChange(input.name, event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-700 bg-slate-950 px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder={`Enter ${input.type}`}
                />
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {invokeError && <p className="text-sm text-rose-400">{invokeError}</p>}
              <p className="text-xs text-gray-500">
                Connected wallet will be used to sign or simulate requests.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="md" onClick={() => setFieldValues({})}>
                Reset inputs
              </Button>
              <Button variant="primary" size="md" onClick={handleInvoke} isLoading={isInvoking}>
                Execute method
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-white">Raw JSON Response</h2>
          <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-gray-700 bg-slate-950 p-4 text-xs text-gray-100">
            {formatJson(responsePayload ?? { message: 'Invoke a method to see raw output here.' })}
          </pre>
        </div>
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Gas & Transaction</h2>
            <p className="text-sm text-gray-400">
              Review estimated gas and the signed transaction preview.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-700 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Estimated Gas</p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {gasMetrics?.estimated ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-700 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Charged Gas</p>
              <p className="mt-3 text-3xl font-semibold text-white">{gasMetrics?.charged ?? '—'}</p>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Transaction Log</h3>
            <pre className="mt-3 max-h-44 overflow-auto rounded-2xl border border-gray-700 bg-slate-950 p-4 text-xs text-gray-100">
              {formatJson(transactionLog ?? { status: 'no transaction yet' })}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
