/**
 * Migration: Add IPFS evidence fields
 * 
 * This migration adds fields to the DisputeEvidence table to support
 * IPFS file storage, virus scanning, and thumbnail generation.
 */

exports.up = async function(knex) {
  await knex.schema.alterTable('dispute_evidence', (table) => {
    // Update evidence_type to include new types
    table.text('evidence_type').alter();
    
    // Add file metadata fields
    table.text('filename').nullable();
    table.text('mime_type').nullable();
    table.integer('file_size').nullable();
    
    // Add IPFS fields
    table.text('ipfs_cid').nullable();
    table.text('thumbnail_cid').nullable();
    
    // Add virus scanning fields
    table.text('scan_status').defaultTo('pending').nullable();
    table.text('scan_result').nullable();
    
    // Add index for IPFS CID lookups
    table.index('ipfs_cid');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('dispute_evidence', (table) => {
    // Drop indexes
    table.dropIndex('ipfs_cid');
    
    // Drop columns
    table.dropColumn('filename');
    table.dropColumn('mime_type');
    table.dropColumn('file_size');
    table.dropColumn('ipfs_cid');
    table.dropColumn('thumbnail_cid');
    table.dropColumn('scan_status');
    table.dropColumn('scan_result');
    
    // Revert evidence_type (assuming original was enum-like)
    // Note: This might need adjustment based on original constraints
  });
};
