/**
 * @openapi
 * /api/disputes:
 *   get:
 *     tags: [Disputes]
 *     summary: List all disputes (paginated)
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated list of disputed escrows
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
 *                 - id: 5
 *                   status: "Disputed"
 *                   clientAddress: "GABC...XYZ"
 *                   freelancerAddress: "GXYZ...ABC"
 *                   totalAmount: "3000000000"
 *               page: 1
 *               limit: 20
 *               total: 3
 *               totalPages: 1
 *               hasNextPage: false
 *               hasPreviousPage: false
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/disputes/{escrowId}:
 *   get:
 *     tags: [Disputes]
 *     summary: Get dispute details for a specific escrow
 *     parameters:
 *       - name: escrowId
 *         in: path
 *         required: true
 *         description: Escrow ID
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Dispute details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Escrow'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
