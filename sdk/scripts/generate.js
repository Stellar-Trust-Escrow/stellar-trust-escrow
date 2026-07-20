#!/usr/bin/env node
/**
 * Reads contracts/escrow_contract/spec.json and regenerates
 * sdk/src/generated/EscrowContractClient.ts.
 *
 * Usage:
 *   node sdk/scripts/generate.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const spec = JSON.parse(readFileSync(resolve(root, 'contracts/escrow_contract/spec.json'), 'utf8'));

const STELLAR_TYPE_MAP = {
  Address: 'string',
  i128: 'bigint',
  u128: 'bigint',
  u64: 'bigint',
  u32: 'number',
  i32: 'number',
  bool: 'boolean',
  String: 'string',
  EscrowState: 'EscrowState',
  Milestone: 'Milestone',
};

const SCVAL_BUILDER = {
  Address: (name) => `new Address(params.${toCamel(name)}).toScVal()`,
  i128: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'i128' })`,
  u128: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'u128' })`,
  u64: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'u64' })`,
  u32: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'u32' })`,
  i32: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'i32' })`,
  bool: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'bool' })`,
  String: (name) => `nativeToScVal(params.${toCamel(name)}, { type: 'string' })`,
};

function toCamel(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function tsType(stellarType) {
  if (!stellarType) return 'null';
  if (stellarType.startsWith('Option<')) {
    const inner = stellarType.slice(7, -1);
    return `${tsType(inner)} | null`;
  }
  if (stellarType.startsWith('Vec<')) {
    const inner = stellarType.slice(4, -1);
    return `${tsType(inner)}[]`;
  }
  return STELLAR_TYPE_MAP[stellarType] ?? 'unknown';
}

function buildScVal(param) {
  const builder = SCVAL_BUILDER[param.type];
  if (builder) return builder(param.name);
  return `nativeToScVal(params.${toCamel(param.name)})`;
}

function renderMethod(fn) {
  const returnTs = tsType(fn.output);
  const paramFields = fn.inputs.map((p) => `    ${toCamel(p.name)}: ${tsType(p.type)};`).join('\n');
  const scvalArgs = fn.inputs.map(buildScVal).join(',\n      ');
  const methodName = toCamel(fn.name);

  return `
  /**
   * ${fn.doc}
   */
  async ${methodName}(params: {
${paramFields}
  }): Promise<TxResult<${returnTs}>> {
    return invokeContract<${returnTs}>(this.config, '${fn.name}', [
      ${scvalArgs},
    ]);
  }`;
}

const methods = spec.functions.map(renderMethod).join('\n');

const output = `/**
 * Auto-generated from contracts/escrow_contract/spec.json
 * Do not edit — run \`node sdk/scripts/generate.js\` to regenerate.
 */

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { invokeContract } from '../txBuilder.js';
import type { SdkConfig, TxResult, EscrowState, Milestone } from '../types.js';

export class EscrowContractClient {
  constructor(private readonly config: SdkConfig) {}
${methods}
}
`;

const outPath = resolve(__dirname, '../src/generated/EscrowContractClient.ts');
writeFileSync(outPath, output, 'utf8');
console.log(`Generated ${outPath}`);
