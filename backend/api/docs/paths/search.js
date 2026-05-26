/**
 * @openapi
 * /api/search:
 *   get:
 *     tags: [Search]
 *     summary: Full-text search over escrows with fuzzy matching, filters, and facets
 *     parameters:
 *       - name: q
 *         in: query
 *         description: Free-text search term
 *         schema:
 *           type: string
 *           example: "design"
 *       - name: status
 *         in: query
 *         description: "Single or comma-separated statuses: Active,Completed,Disputed,Cancelled"
 *         schema:
 *           type: string
 *           example: "Active"
 *       - name: client
 *         in: query
 *         description: Exact client Stellar address
 *         schema:
 *           type: string
 *       - name: freelancer
 *         in: query
 *         description: Exact freelancer Stellar address
 *         schema:
 *           type: string
 *       - name: minAmount
 *         in: query
 *         schema:
 *           type: number
 *           example: 1000000000
 *       - name: maxAmount
 *         in: query
 *         schema:
 *           type: number
 *       - name: dateFrom
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: dateTo
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: sortBy
 *         in: query
 *         schema:
 *           type: string
 *           enum: [createdAt, totalAmount, status]
 *           default: createdAt
 *       - name: sortOrder
 *         in: query
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Search results with facets
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     facets:
 *                       type: object
 *                       description: Aggregated facet counts for filtering UI
 *                       properties:
 *                         status:
 *                           type: object
 *                           additionalProperties:
 *                             type: integer
 *             example:
 *               data: []
 *               page: 1
 *               limit: 20
 *               total: 0
 *               totalPages: 0
 *               hasNextPage: false
 *               hasPreviousPage: false
 *               facets:
 *                 status:
 *                   Active: 5
 *                   Completed: 12
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/search/suggest:
 *   get:
 *     tags: [Search]
 *     summary: Completion suggestions for a given prefix
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Prefix to complete
 *         schema:
 *           type: string
 *           example: "des"
 *       - name: size
 *         in: query
 *         description: Max suggestions to return (default 5, max 20)
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *     responses:
 *       200:
 *         description: Suggestions list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                       score:
 *                         type: number
 *             example:
 *               suggestions:
 *                 - text: "design"
 *                   score: 1.5
 *                 - text: "desktop app"
 *                   score: 1.2
 *       400:
 *         description: Missing query parameter q
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/search/analytics:
 *   get:
 *     tags: [Search]
 *     summary: Search analytics — top queries, zero-result queries, total count (admin only)
 *     security:
 *       - AdminApiKey: []
 *     responses:
 *       200:
 *         description: Search analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSearches:
 *                   type: integer
 *                 topQueries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       query:
 *                         type: string
 *                       count:
 *                         type: integer
 *                 zeroResultQueries:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/search/reindex:
 *   post:
 *     tags: [Search]
 *     summary: Rebuild the Elasticsearch index from the database (admin only)
 *     security:
 *       - AdminApiKey: []
 *     responses:
 *       200:
 *         description: Reindex started or completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 indexed:
 *                   type: integer
 *                   description: Number of documents indexed
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
