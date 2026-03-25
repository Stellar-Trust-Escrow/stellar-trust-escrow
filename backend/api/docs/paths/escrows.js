/**
 * @openapi
 * /api/escrows:
 *   get:
 *     tags: [Escrows]
 *     summary: List escrows (paginated)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: status
 *         in: query
 *         description: "Single or comma-separated statuses: Active,Completed,Disputed,Cancelled"
 *         schema:
 *           type: string
 *           example: "Active,Completed"
 *       - name: client
 *         in: query
 *         description: Filter by client Stellar address
 *         schema:
 *           type: string
 *           example: "GABC...XYZ"
 *       - name: freelancer
 *         in: query
 *         description: Filter by freelancer Stellar address
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         description: Search by escrow ID or address substring
 *         schema:
 *           type: string
 *       - name: minAmount
 *         in: query
 *         description: Minimum totalAmount (numeric string, in stroops)
 *         schema:
 *           type: string
 *           example: "1000000000"
 *       - name: maxAmount
 *         in: query
 *         description: Maximum totalAmount (numeric string, in stroops)
 *         schema:
 *           type: string
 *       - name: dateFrom
 *         in: query
 *         description: "ISO date — createdAt >= dateFrom"
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *       - name: dateTo
 *         in: query
 *         description: "ISO date — createdAt <= dateTo (end of day)"
 *         schema:
 *           type: string
 *           format: date
 *       - name: sortBy
 *         in: query
 *         description: Sort field
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
 *     responses:
 *       200:
 *         description: Paginated list of escrows
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
 *                         $ref: '#/components/schemas/Escrow'
 *             example:
 *               data:
 *                 - id: 1
 *                   clientAddress: "GABC...XYZ"
 *                   freelancerAddress: "GXYZ...ABC"
 *                   totalAmount: "2000000000"
 *                   remainingBalance: "1500000000"
 *                   status: "Active"
 *                   createdAt: "2025-03-01T00:00:00Z"
 *               page: 1
 *               limit: 20
 *               total: 42
 *               totalPages: 3
 *               hasNextPage: true
 *               hasPreviousPage: false
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/escrows/broadcast:
 *   post:
 *     tags: [Escrows]
 *     summary: Broadcast a pre-signed create_escrow transaction to Stellar
 *     description: Submit a signed XDR transaction envelope to the Stellar network to create an escrow on-chain.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signedXdr]
 *             properties:
 *               signedXdr:
 *                 type: string
 *                 description: Base64-encoded signed Stellar transaction XDR
 *                 example: "AAAAAgAAAA..."
 *           examples:
 *             broadcast:
 *               summary: Broadcast signed XDR
 *               value:
 *                 signedXdr: "AAAAAgAAAA..."
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 hash:
 *                   type: string
 *                   example: "abc123def456..."
 *       400:
 *         description: Invalid or missing XDR
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/escrows/{id}:
 *   get:
 *     tags: [Escrows]
 *     summary: Get full escrow details including milestones
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Escrow ID (numeric)
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Escrow details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Escrow'
 *             example:
 *               id: 1
 *               clientAddress: "GABC...XYZ"
 *               freelancerAddress: "GXYZ...ABC"
 *               arbiterAddress: null
 *               tokenAddress: "USDC_CONTRACT"
 *               totalAmount: "2000000000"
 *               remainingBalance: "1500000000"
 *               status: "Active"
 *               briefHash: "QmIPFSHash..."
 *               deadline: null
 *               createdAt: "2025-03-01T00:00:00Z"
 *               milestones:
 *                 - id: 0
 *                   title: "Initial Designs"
 *                   amount: "500000000"
 *                   status: "Approved"
 *                   submittedAt: "2025-03-05T00:00:00Z"
 *                   resolvedAt: "2025-03-06T00:00:00Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/escrows/{id}/milestones:
 *   get:
 *     tags: [Escrows]
 *     summary: List milestones for an escrow (paginated)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Escrow ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated list of milestones
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
 *                         $ref: '#/components/schemas/Milestone'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/escrows/{id}/milestones/{milestoneId}:
 *   get:
 *     tags: [Escrows]
 *     summary: Get a single milestone
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: milestoneId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *           example: 0
 *     responses:
 *       200:
 *         description: Milestone details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Milestone'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
