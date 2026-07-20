import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { SdkConfig, TxResult } from './types.js';
import { ContractError, NetworkError } from './errors.js';
import { signWithKeypair } from './signers/secretKeySigner.js';
import { signWithFreighter } from './signers/freighterSigner.js';

const MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

export async function invokeContract<T>(
  config: SdkConfig,
  method: string,
  args: xdr.ScVal[],
): Promise<TxResult<T>> {
  const server = new SorobanRpc.Server(config.rpcUrl);
  const contract = new Contract(config.contractId);

  const sourceAddress =
    config.signer.type === 'secret'
      ? config.signer.keypair.publicKey()
      : await getFreighterPublicKey();

  const account = await server.getAccount(sourceAddress).catch(() => {
    throw new NetworkError('Failed to load source account from RPC');
  });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx).catch(() => {
    throw new NetworkError('Transaction simulation failed');
  });

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    const code = extractErrorCode(simResult.error);
    throw new ContractError(code, simResult.error);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();

  let signedXdr: string;
  if (config.signer.type === 'secret') {
    signedXdr = signWithKeypair(preparedTx, config.signer.keypair, config.networkPassphrase);
  } else {
    signedXdr = await signWithFreighter(preparedTx.toXDR(), config.networkPassphrase);
  }

  const sendResult = await server
    .sendTransaction(TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase))
    .catch(() => {
      throw new NetworkError('Failed to send transaction');
    });

  if (sendResult.status === 'ERROR') {
    throw new NetworkError(`Transaction submission error: ${sendResult.errorResult?.toXDR()}`);
  }

  const txHash = sendResult.hash;
  return poll<T>(server, txHash);
}

async function poll<T>(server: SorobanRpc.Server, txHash: string): Promise<TxResult<T>> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await server.getTransaction(txHash).catch(() => null);
    if (!result || result.status === 'NOT_FOUND') continue;
    if (result.status === 'FAILED') {
      throw new NetworkError(`Transaction ${txHash} failed on-chain`);
    }
    if (result.status === 'SUCCESS') {
      const raw = result.returnValue ?? xdr.ScVal.scvVoid();
      return {
        txHash,
        result: scValToNative(raw) as T,
        ledger: result.ledger,
      };
    }
  }
  throw new NetworkError(`Transaction ${txHash} timed out after polling`);
}

function extractErrorCode(errorStr: string): number {
  const match = errorStr.match(/Error\(Contract, #(\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function getFreighterPublicKey(): Promise<string> {
  const freighter = (
    globalThis as unknown as { freighterApi?: { getPublicKey: () => Promise<string> } }
  ).freighterApi;
  if (!freighter) throw new Error('Freighter extension is not installed');
  return freighter.getPublicKey();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
