import { useState, useEffect, useCallback, useRef } from 'react';
import { Horizon } from '@stellar/stellar-sdk';
import api from '../lib/api/client';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ||
  (NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org');
const PAGE_LIMIT = 200;
const MAX_RETRY_DELAY_MS = 8000;

/**
 * Fetches a page of operations with exponential backoff on HTTP 429.
 */
async function fetchOperationsPage(server, address, cursor) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      let builder = server.operations().forAccount(address).order('desc').limit(PAGE_LIMIT);
      if (cursor) builder = builder.cursor(cursor);
      return await builder.call();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429 && attempt < 5) {
        const delay = Math.min(2 ** attempt * 500, MAX_RETRY_DELAY_MS);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

function classifyOperation(op, address, contractsByAddress, escrowIdByTxHash) {
  const counterparty = op.to || op.from || op.source_account;
  const contract = contractsByAddress.get(counterparty);
  const escrowId = escrowIdByTxHash.get(op.transaction_hash) ?? null;

  let label = 'Unrecognised';
  if (contract) {
    if (op.type === 'payment' || op.type === 'invoke_host_function') {
      if (op.to === contract.address && op.from === address) label = 'Funded';
      else if (op.from === contract.address && op.to === address) label = escrowId ? 'Released' : 'Fee';
      else label = `${contract.name} operation`;
    }
  } else if (op.type !== 'payment' && op.type !== 'invoke_host_function' && op.type !== 'create_account') {
    label = 'Unrecognised';
  } else {
    label = 'Unknown';
  }

  return {
    id: op.id,
    type: op.type,
    label,
    amount: op.amount ?? null,
    asset: op.asset_code || (op.asset_type === 'native' ? 'XLM' : op.asset_type) || null,
    counterparty,
    escrowId,
    contractName: contract?.name ?? null,
    createdAt: op.created_at,
  };
}

/**
 * @param {string} address - Stellar wallet address to fetch history for
 * @returns {{
 *   groups: { escrowId: string|null, contractName: string|null, operations: object[] }[],
 *   other: object[],
 *   loading: boolean,
 *   loadingMore: boolean,
 *   error: string|null,
 *   hasMore: boolean,
 *   loadMore: () => void,
 *   allOperations: object[],
 * }}
 */
export function useWalletHistory(address) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const serverRef = useRef(null);
  const cursorRef = useRef(null);
  const contractsRef = useRef(new Map());
  const seenIdsRef = useRef(new Set());

  if (!serverRef.current) {
    serverRef.current = new Horizon.Server(HORIZON_URL);
  }

  const loadContracts = useCallback(async () => {
    if (contractsRef.current.size > 0) return contractsRef.current;
    try {
      const res = await api.get('/v1/contracts/addresses');
      const map = new Map();
      for (const c of res.data.contracts || []) map.set(c.address, c);
      contractsRef.current = map;
    } catch {
      // Labelling degrades gracefully to "Unknown" if this fails.
    }
    return contractsRef.current;
  }, []);

  const loadEscrowIdsByTxHash = useCallback(async (txHashes) => {
    if (txHashes.length === 0) return new Map();
    try {
      const res = await api.get('/v1/events/escrow-ids-by-tx', {
        params: { hashes: txHashes.join(',') },
      });
      return new Map(Object.entries(res.data.map || {}));
    } catch {
      return new Map(); // labelling degrades to "Unknown" escrow grouping if this fails
    }
  }, []);

  const fetchPage = useCallback(
    async (isFirstPage) => {
      if (!address) return;
      isFirstPage ? setLoading(true) : setLoadingMore(true);
      setError(null);
      try {
        const contracts = await loadContracts();
        const page = await fetchOperationsPage(serverRef.current, address, cursorRef.current);
        const records = page?.records ?? [];

        if (records.length === 0) {
          setHasMore(false);
          return;
        }

        // Idempotent on re-render: skip any operation id we've already added.
        const fresh = records.filter((r) => !seenIdsRef.current.has(r.id));
        fresh.forEach((r) => seenIdsRef.current.add(r.id));

        const txHashes = [...new Set(fresh.map((r) => r.transaction_hash).filter(Boolean))];
        const escrowIdByTxHash = await loadEscrowIdsByTxHash(txHashes);

        const classified = fresh.map((op) => classifyOperation(op, address, contracts, escrowIdByTxHash));
        setOperations((prev) => [...prev, ...classified]);

        cursorRef.current = records[records.length - 1]?.paging_token ?? cursorRef.current;
        setHasMore(records.length === PAGE_LIMIT);
      } catch (err) {
        setError(err?.message || 'Failed to load wallet history.');
      } finally {
        isFirstPage ? setLoading(false) : setLoadingMore(false);
      }
    },
    [address, loadContracts, loadEscrowIdsByTxHash],
  );

  useEffect(() => {
    setOperations([]);
    cursorRef.current = null;
    seenIdsRef.current = new Set();
    setHasMore(true);
    if (address) fetchPage(true);
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) fetchPage(false);
  }, [fetchPage, loadingMore, hasMore]);

  const groupsMap = new Map();
  const other = [];
  for (const op of operations) {
    if (op.escrowId) {
      if (!groupsMap.has(op.escrowId)) {
        groupsMap.set(op.escrowId, { escrowId: op.escrowId, contractName: op.contractName, operations: [] });
      }
      groupsMap.get(op.escrowId).operations.push(op);
    } else {
      other.push(op);
    }
  }

  return {
    groups: [...groupsMap.values()],
    other,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    allOperations: operations,
  };
}

export default useWalletHistory;
