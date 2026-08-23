import React, { useState, useEffect, useCallback } from 'react';

export default function AssetSelector({ value, amount, onChange }) {
  const [assets, setAssets] = useState([]);
  const [xlmPreview, setXlmPreview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/assets/supported')
      .then((r) => r.json())
      .then(setAssets)
      .catch((err) => setError(err.message));
  }, []);

  const fetchPreview = useCallback(async (code) => {
    if (!amount || code === 'XLM') { setXlmPreview(null); return; }
    try {
      const res = await fetch(`/api/assets/xlm-equivalent?amount=${amount}&assetCode=${code}`);
      const data = await res.json();
      setXlmPreview(data.xlmAmount);
    } catch { setXlmPreview(null); }
  }, [amount]);

  const handleChange = (e) => {
    const asset = assets.find((a) => a.code === e.target.value) ?? null;
    onChange?.(asset);
    fetchPreview(e.target.value);
  };

  useEffect(() => { if (value?.code) fetchPreview(value.code); }, [amount, value?.code, fetchPreview]);

  return (
    <div className="asset-selector">
      <label htmlFor="asset-select">Settlement Asset</label>
      {error && <p className="asset-selector__error">{error}</p>}
      <select id="asset-select" value={value?.code ?? 'XLM'} onChange={handleChange} disabled={!assets.length}>
        {!assets.length && <option value="XLM">Loading…</option>}
        {assets.map((a) => (
          <option key={a.code} value={a.code}>{a.code}{a.native ? ' (native)' : ` — ${a.name}`}</option>
        ))}
      </select>
      {value && !value.native && <p className="asset-selector__issuer">Issuer: <code>{value.issuer}</code></p>}
      {xlmPreview !== null && <p className="asset-selector__preview">≈ {xlmPreview} XLM</p>}
    </div>
  );
}
