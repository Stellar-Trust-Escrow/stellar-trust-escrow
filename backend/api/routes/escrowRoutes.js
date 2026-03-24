import express from 'express';
import escrowController from '../controllers/escrowController.js';

const router = express.Router();

/**
 * @route  GET /api/escrows
 * @desc   List escrows with the standard pagination envelope.
 * @query  page          {number}  default 1
 * @query  limit         {number}  default 20, max 100
 * @query  status        {string}  single or comma-separated: Active,Completed,Disputed,Cancelled
 * @query  client        {string}  filter by client Stellar address
 * @query  freelancer    {string}  filter by freelancer Stellar address
 * @query  search        {string}  search by escrow ID or address substring
 * @query  minAmount     {string}  minimum totalAmount (numeric string)
 * @query  maxAmount     {string}  maximum totalAmount (numeric string)
 * @query  dateFrom      {string}  ISO date — createdAt >= dateFrom
 * @query  dateTo        {string}  ISO date — createdAt <= dateTo (end of day)
 * @query  sortBy        {string}  createdAt | totalAmount | status  (default: createdAt)
 * @query  sortOrder     {string}  asc | desc  (default: desc)
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/', escrowController.listEscrows);

/**
 * @route  POST /api/escrows/broadcast
 * @desc   Broadcast a pre-signed create_escrow transaction to the Stellar network.
 * @body   { signedXdr: string }
 */
router.post('/broadcast', escrowController.broadcastCreateEscrow);

/**
 * @route  GET /api/escrows/:id/milestones
 * @desc   List milestones for an escrow with the standard pagination envelope.
 * @query  page (default 1), limit (default 20, max 100)
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/:id/milestones', escrowController.getMilestones);

/**
 * @route  GET /api/escrows/:id/milestones/:milestoneId
 * @desc   Get a single milestone.
 */
router.get('/:id/milestones/:milestoneId', escrowController.getMilestone);

/**
 * @route  GET /api/escrows/:id
 * @desc   Get full details for a single escrow including milestones.
 * @param  id - escrow_id from the contract
 */
router.get('/:id', escrowController.getEscrow);

export default router;
