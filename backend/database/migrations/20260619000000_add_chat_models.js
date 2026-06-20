/**
 * Migration: Add encrypted dispute chat tables
 * Version:   20260619000000_add_chat_models
 *
 * roomId convention: "dispute:<escrowId>"
 * encryptedKey: AES-256 session key wrapped via ECIES — server never decrypts.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_room_keys (
      id          TEXT PRIMARY KEY,
      room_id     TEXT NOT NULL,
      address     TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      tenant_id   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_chat_room_key_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT uq_chat_room_key_room_address UNIQUE (room_id, address)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chat_room_keys_room_id_idx ON chat_room_keys(room_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chat_room_keys_tenant_room_idx ON chat_room_keys(tenant_id, room_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id             TEXT PRIMARY KEY,
      room_id        TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      ciphertext     TEXT NOT NULL,
      iv             TEXT NOT NULL,
      tag            TEXT NOT NULL,
      tenant_id      TEXT NOT NULL,
      sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_chat_message_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chat_messages_room_sent_idx ON chat_messages(room_id, sent_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chat_messages_tenant_room_idx ON chat_messages(tenant_id, room_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS chat_messages`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS chat_room_keys`);
}
