/**
 * @openapi
 * /api/events:
 *   get:
 *     tags: [Events]
 *     summary: List all indexed Stellar contract events (paginated)
 *     parameters:
 *       - name: eventType
 *         in: query
 *         description: Filter by event type
 *         schema:
 *           type: string
 *           example: "escrow_created"
 *       - name: escrowId
 *         in: query
 *         description: Filter by escrow ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: fromLedger
 *         in: query
 *         description: Filter events from this ledger sequence number
 *         schema:
 *           type: integer
 *       - name: toLedger
 *         in: query
 *         description: Filter events up to this ledger sequence number
 *         schema:
 *           type: integer
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated list of events
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ContractEvent'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/events/types:
 *   get:
 *     tags: [Events]
 *     summary: List distinct event types present in the index
 *     responses:
 *       200:
 *         description: Array of event type strings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *             example: ["escrow_created", "milestone_approved", "dispute_raised"]
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/events/stats:
 *   get:
 *     tags: [Events]
 *     summary: Aggregate event counts per type
 *     responses:
 *       200:
 *         description: Event counts keyed by type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: integer
 *             example:
 *               escrow_created: 120
 *               milestone_approved: 85
 *               dispute_raised: 7
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/events/escrow/{escrowId}:
 *   get:
 *     tags: [Events]
 *     summary: List all indexed events for a specific escrow (chronological)
 *     parameters:
 *       - name: escrowId
 *         in: path
 *         required: true
 *         description: Escrow ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: eventType
 *         in: query
 *         description: Filter by event type
 *         schema:
 *           type: string
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated events for the escrow
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/events/{id}:
 *   get:
 *     tags: [Events]
 *     summary: Get a single indexed event by database ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Event database ID
 *         schema:
 *           type: integer
 *           example: 42
 *     responses:
 *       200:
 *         description: Event details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContractEvent'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * components:
 *   schemas:
 *     ContractEvent:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 42
 *         eventType:
 *           type: string
 *           example: "escrow_created"
 *         escrowId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         ledger:
 *           type: integer
 *           example: 1234567
 *         txHash:
 *           type: string
 *           example: "abc123..."
 *         payload:
 *           type: object
 *           description: Event-specific data
 *         indexedAt:
 *           type: string
 *           format: date-time
 */
