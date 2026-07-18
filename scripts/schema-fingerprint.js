#!/usr/bin/env node
/**
 * Schema fingerprint
 *
 * Prints a deterministic, ordered JSON description of the *structure* of every
 * table in the public schema (table name, column name, data type, nullability,
 * defaults, and indexes). Used by the Migration Safety CI to assert that a
 * rollback (`migrate.js down`) followed by a re-apply (`migrate.js up`) leaves
 * the schema byte-for-byte identical — i.e. `down()` is a true inverse of
 * `up()`. Only structure is captured; row data is intentionally ignored.
 *
 * Usage:
 *   node scripts/schema-fingerprint.js
 */

import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'backend/package.json'));
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT
      c.table_name   AS table_name,
      c.column_name  AS column_name,
      c.data_type    AS data_type,
      c.is_nullable  AS is_nullable,
      COALESCE(c.column_default, '') AS column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.column_name
  `);

  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);

  const fingerprint = {
    columns: columns.map((r) => ({
      table: r.table_name,
      column: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
      default: r.column_default,
    })),
    indexes: indexes.map((r) => ({ name: r.indexname, table: r.tablename, def: r.indexdef })),
  };

  process.stdout.write(JSON.stringify(fingerprint));
}

main()
  .catch(async (e) => {
    console.error('❌ schema-fingerprint failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
