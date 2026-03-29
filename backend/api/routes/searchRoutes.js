import express from 'express';
import searchController from '../controllers/searchController.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

/**
 * @route  GET /api/search
 * @desc   Full-text search over escrows with fuzzy matching, filters, and facets.
 * @query  q           {string}  free-text search term
 * @query  status      {string}  single or comma-separated: Active,Completed,Disputed,Cancelled
 * @query  client      {string}  exact client Stellar address
 * @query  freelancer  {string}  exact freelancer Stellar address
 * @query  minAmount   {number}  minimum totalAmount
 * @query  maxAmount   {number}  maximum totalAmount
 * @query  dateFrom    {string}  ISO date — createdAt >= dateFrom
 * @query  dateTo      {string}  ISO date — createdAt <= dateTo
 * @query  sortBy      {string}  createdAt | totalAmount | status  (default: createdAt)
 * @query  sortOrder   {string}  asc | desc  (default: desc)
 * @query  page        {number}  default 1
 * @query  limit       {number}  default 20, max 100
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage, facets }
 */
router.get('/', searchController.searchEscrows);

/**
 * @route  GET /api/search/suggest
 * @desc   Completion suggestions for a given prefix.
 * @query  q     {string}  prefix to complete (required)
 * @query  size  {number}  max suggestions to return (default 5, max 20)
 * @returns { suggestions: [{ text, score }] }
 */
router.get('/suggest', searchController.getSuggestions);

/**
 * @route  GET /api/search/analytics
 * @desc   Search analytics — top queries, zero-result queries, total count.
 * @access Admin only
 */
router.get('/analytics', adminAuth, searchController.getAnalytics);

/**
 * @route  POST /api/search/reindex
 * @desc   Rebuild the Elasticsearch index from the database.
 * @access Admin only
 */
router.post('/reindex', adminAuth, searchController.reindex);

export default router;
