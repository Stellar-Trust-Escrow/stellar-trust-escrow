import { useEffect, useState } from 'react';

/**
 * Hook: detects wallet network and exposes a modal component + switch API.
 * Works with Freighter or generic provider that exposes `getNetwork` and `switchNetwork`.
 */
export default function useNetworkGuard({ targetNetwork = 'Testnet', walletProvider = null } = {}) {
  const [current, setCurrent] = useState(null);
  const [mismatch, setMismatch] = useState(false);

  const provider = walletProvider || (typeof window !== 'undefined' && window.freighterApi) || null;

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        if (!provider) return;
        // Freighter has getNetwork, other providers may have chainId
        const info = await (provider.getNetwork
          ? provider.getNetwork()
          : provider.request?.({ method: 'eth_chainId' }));
        const name = info?.name || info || String(info);
        if (!mounted) return;
        setCurrent(name);
        setMismatch(String(name).toLowerCase() !== String(targetNetwork).toLowerCase());
      } catch (err) {
        setCurrent(null);
        setMismatch(false);
      }
    }

    check();
    const handle = setInterval(check, 2500);
    return () => {
      mounted = false;
      clearInterval(handle);
    };
  }, [provider, targetNetwork]);

  const trySwitch = async () => {
    if (!provider) throw new Error('No wallet provider');
    if (provider.switchNetwork) {
      return provider.switchNetwork(targetNetwork).catch((e) => {
        throw e;
      });
    }
    if (provider.request) {
      // best-effort: not all providers support this
      return provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetNetwork }],
      });
    }
    throw new Error('Provider does not support network switch');
  };

  function GuardModal() {
    if (!mismatch) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      >
        <div style={{ width: 480, margin: '10% auto', background: 'white', padding: 20 }}>
          <h3>Network Mismatch</h3>
          <p>
            Your wallet is connected to <strong>{current}</strong>, but the app requires{' '}
            <strong>{targetNetwork}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => trySwitch().catch(() => {})}>Switch Network</button>
          </div>
        </div>
      </div>
    );
  }

  return { isMismatch: mismatch, currentNetwork: current, targetNetwork, trySwitch, GuardModal };
}
