'use client';

import { useState, useCallback } from 'react';
import { Copy, Zap, LogOut, ChevronDown } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Spinner from '../../../components/ui/Spinner';
import { useToast } from '../../../contexts/ToastContext';

// Simple JSON syntax highlighter
function JsonHighlight({ code }) {
  const formatted = JSON.stringify(code, null, 2);
  const highlighted = formatted.split('\n').map((line, i) => {
    let color = 'text-gray-400';
    if (line.includes('"') && line.includes(':')) color = 'text-indigo-400';
    if (line.match(/:\s*(true|false|null)/)) color = 'text-emerald-400';
    if (line.match(/:\s*\d+/)) color = 'text-amber-400';
    if (line.match(/:\s*"/)) color = 'text-green-400';
    return (
      <div key={i} className={color}>
        {line}
      </div>
    );
  });

  return <div className="font-mono text-xs whitespace-pre-wrap">{highlighted}</div>;
}

// Mock Soroban ABI for demo
const MOCK_ABI = {
  functions: [
    {
      name: 'initialize',
      type: 'contract',
      inputs: [
        { name: 'owner', type: 'Address' },
        { name: 'token', type: 'Address' },
        { name: 'fee_rate', type: 'U32' },
      ],
      outputs: [],
    },
    {
      name: 'deposit',
      type: 'contract',
      inputs: [
        { name: 'account', type: 'Address' },
        { name: 'amount', type: 'I128' },
      ],
      outputs: [{ type: 'I128' }],
    },
    {
      name: 'get_balance',
      type: 'contract',
      inputs: [{ name: 'account', type: 'Address' }],
      outputs: [{ type: 'I128' }],
    },
    {
      name: 'withdraw',
      type: 'contract',
      inputs: [
        { name: 'account', type: 'Address' },
        { name: 'amount', type: 'I128' },
      ],
      outputs: [{ type: 'Bool' }],
    },
  ],
};

function InputField({ param, value, onChange }) {
  const getInputType = (paramType) => {
    if (paramType === 'U32' || paramType === 'I128') return 'number';
    if (paramType === 'Bool') return 'checkbox';
    return 'text';
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-400">
        {param.name} <span className="text-gray-600">({param.type})</span>
      </label>
      {getInputType(param.type) === 'checkbox' ? (
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          className="accent-indigo-500"
        />
      ) : (
        <input
          type={getInputType(param.type)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${param.type}`}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
      )}
    </div>
  );
}

export default function ConsolePage() {
  const { showToast } = useToast();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [gasUsed, setGasUsed] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = useCallback(() => {
    if (adminKey === 'demo-key-12345') {
      setIsAuthorized(true);
      setError('');
      showToast('✓ Authorized as admin', 'success');
    } else {
      setError('Invalid admin key');
      showToast('Invalid admin key', 'error');
    }
  }, [adminKey, showToast]);

  const handleFunctionSelect = (func) => {
    setSelectedFunction(func);
    setInputs({});
    setResult(null);
    setGasUsed(null);
    setLogs([]);
  };

  const handleInputChange = (paramName, value) => {
    setInputs((prev) => ({ ...prev, [paramName]: value }));
  };

  const handleInvoke = async () => {
    if (!selectedFunction) return;

    setLoading(true);
    setError('');

    try {
      const paramValues = selectedFunction.inputs.map((p) => ({
        name: p.name,
        value: inputs[p.name],
      }));

      // Simulate contract invocation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockResult = {
        status: 'success',
        output: selectedFunction.outputs.length > 0 ? Math.floor(Math.random() * 1000000) : null,
        txHash: `0x${Math.random().toString(16).slice(2)}`,
      };

      const mockLogs = [
        `[info] Invoking ${selectedFunction.name}...`,
        `[debug] Parameters: ${JSON.stringify(paramValues)}`,
        `[info] Transaction submitted`,
        `[debug] Waiting for confirmation...`,
        `[info] Transaction confirmed`,
        `[success] Function call completed`,
      ];

      setResult(mockResult);
      setGasUsed(Math.floor(Math.random() * 500000) + 50000);
      setLogs(mockLogs);
      showToast(`✓ Function ${selectedFunction.name} invoked successfully`, 'success');
    } catch (err) {
      setError(err.message);
      showToast('Failed to invoke function', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Smart Contract Console</h1>
            <p className="text-gray-400 text-sm">Admin access required</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-2">Admin API Key</label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                placeholder="Enter admin key"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-xs text-gray-600 mt-2">Demo key: demo-key-12345</p>
            </div>

            {error && <div className="text-sm text-red-400 bg-red-500/10 p-3 rounded">{error}</div>}

            <Button variant="primary" onClick={handleAuth} className="w-full">
              Unlock Console
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Smart Contract Console</h1>
          <p className="text-gray-400 text-sm">Soroban contract ABI explorer</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsAuthorized(false)}
          className="flex items-center gap-2"
        >
          <LogOut size={16} /> Logout
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Function Browser */}
        <div className="card space-y-4 h-fit sticky top-6">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Zap size={18} />
            Available Functions
          </h2>

          <div className="space-y-2">
            {MOCK_ABI.functions.map((func) => (
              <button
                key={func.name}
                onClick={() => handleFunctionSelect(func)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                  selectedFunction?.name === func.name
                    ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-300'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{func.name}</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${selectedFunction?.name === func.name ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Input Form & Results */}
        <div className="lg:col-span-2 space-y-6">
          {selectedFunction ? (
            <>
              {/* Function Details */}
              <div className="card space-y-4">
                <h2 className="font-semibold text-white">{selectedFunction.name}</h2>

                {selectedFunction.inputs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400">Parameters</h3>
                    <div className="grid gap-3">
                      {selectedFunction.inputs.map((param) => (
                        <InputField
                          key={param.name}
                          param={param}
                          value={inputs[param.name] || ''}
                          onChange={(val) => handleInputChange(param.name, val)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {selectedFunction.outputs.length > 0 && (
                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Expected Output</p>
                    <p className="text-sm text-gray-300 font-mono">
                      {selectedFunction.outputs.map((o) => o.type).join(', ')}
                    </p>
                  </div>
                )}

                <Button
                  variant="primary"
                  onClick={handleInvoke}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" /> Invoking...
                    </>
                  ) : (
                    <>
                      <Zap size={16} /> Invoke Function
                    </>
                  )}
                </Button>
              </div>

              {/* Results */}
              {result && (
                <div className="card space-y-4">
                  <h2 className="font-semibold text-white">Execution Result</h2>

                  {gasUsed && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-800/50 p-3 rounded-lg">
                        <p className="text-xs text-gray-400 mb-1">Gas Used</p>
                        <p className="text-lg font-mono text-emerald-400">
                          {gasUsed.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded-lg">
                        <p className="text-xs text-gray-400 mb-1">Status</p>
                        <p className="text-lg font-mono text-emerald-400">
                          {result.status.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Transaction Hash */}
                  <div className="bg-gray-800/50 p-3 rounded-lg">
                    <p className="text-xs text-gray-400 mb-2">Transaction Hash</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-gray-300 overflow-auto">
                        {result.txHash}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(result.txHash);
                          showToast('Copied to clipboard', 'success');
                        }}
                        className="text-gray-500 hover:text-gray-300"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>

                  {/* JSON Response */}
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Response</p>
                    <div className="bg-gray-950 p-3 rounded-lg overflow-auto max-h-40">
                      <JsonHighlight
                        code={result.output !== null ? { output: result.output } : {}}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Logs */}
              {logs.length > 0 && (
                <div className="card space-y-4">
                  <h2 className="font-semibold text-white">Execution Logs</h2>
                  <div className="bg-gray-950 p-3 rounded-lg space-y-1 max-h-48 overflow-auto">
                    {logs.map((log, i) => {
                      let color = 'text-gray-400';
                      if (log.includes('[info]')) color = 'text-blue-400';
                      if (log.includes('[success]')) color = 'text-emerald-400';
                      if (log.includes('[error]')) color = 'text-red-400';
                      if (log.includes('[debug]')) color = 'text-gray-500';

                      return (
                        <p key={i} className={`text-xs font-mono ${color}`}>
                          {log}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12 text-gray-400">
              <Zap size={32} className="mx-auto mb-3 opacity-50" />
              <p>Select a function from the list to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
