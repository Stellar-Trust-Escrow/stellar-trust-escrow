/**
 * @openapi
 * /api/users/{address}:
 *   get:
 *     tags: [Users]
 *     summary: Get user profile (reputation + recent escrows)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   example: "GABC...XYZ"
 *                 reputation:
 *                   $ref: '#/components/schemas/ReputationRecord'
 *                 recentEscrows:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Escrow'
 *             example:
 *               address: "GABC...XYZ"
 *               reputation:
 *                 totalScore: 95.5
 *                 completedEscrows: 12
 *                 disputedEscrows: 1
 *                 disputesWon: 1
 *               recentEscrows: []
 *       400:
 *         description: Invalid Stellar address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Invalid Stellar address"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/users/{address}/escrows:
 *   get:
 *     tags: [Users]
 *     summary: List escrows for a user (paginated)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *       - name: role
 *         in: query
 *         description: Filter by user role in the escrow
 *         schema:
 *           type: string
 *           enum: [client, freelancer, all]
 *           default: all
 *       - name: status
 *         in: query
 *         description: Filter by escrow status
 *         schema:
 *           type: string
 *           enum: [Active, Completed, Disputed, Cancelled]
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated escrow list for the user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       400:
 *         description: Invalid Stellar address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/users/{address}/stats:
 *   get:
 *     tags: [Users]
 *     summary: Get aggregated stats for a user
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: User statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_volume:
 *                   type: string
 *                   description: Total escrow volume in stroops
 *                   example: "10000000000"
 *                 completion_rate:
 *                   type: number
 *                   format: float
 *                   description: Percentage of escrows completed (0–100)
 *                   example: 91.7
 *                 avg_milestone_approval_time_hours:
 *                   type: number
 *                   format: float
 *                   description: Average hours from milestone submission to approval
 *                   example: 24.5
 *       400:
 *         description: Invalid Stellar address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/users/{address}/export:
 *   get:
 *     tags: [Users]
 *     summary: Export all user data as JSON
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: Full user data export
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                   example: "1.0"
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 userAddress:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     escrows:
 *                       type: array
 *                       items: {}
 *                     payments:
 *                       type: array
 *                       items: {}
 *                     kyc:
 *                       type: object
 *                     reputation:
 *                       $ref: '#/components/schemas/ReputationRecord'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/users/{address}/export/file:
 *   get:
 *     tags: [Users]
 *     summary: Download user data as a file
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: JSON file download
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/users/{address}/import:
 *   post:
 *     tags: [Users]
 *     summary: Import user data from a previously exported JSON payload
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               data:
 *                 type: object
 *                 description: Previously exported user data object
 *               mode:
 *                 type: string
 *                 enum: [merge, replace]
 *                 default: merge
 *     responses:
 *       200:
 *         description: Import results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: object
 *       400:
 *         description: Invalid import payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
