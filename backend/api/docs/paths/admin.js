/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Platform-wide statistics
 *     security:
 *       - AdminApiKey: []
 *     responses:
 *       200:
 *         description: Platform stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalEscrows:
 *                   type: integer
 *                 totalUsers:
 *                   type: integer
 *                 totalDisputes:
 *                   type: integer
 *                 activeEscrows:
 *                   type: integer
 *                 totalVolume:
 *                   type: string
 *                   description: Total escrow volume in stroops
 *             example:
 *               totalEscrows: 500
 *               totalUsers: 320
 *               totalDisputes: 12
 *               activeEscrows: 45
 *               totalVolume: "50000000000"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users with pagination and search
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - name: search
 *         in: query
 *         description: Search by address or email
 *         schema:
 *           type: string
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated user list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/users/{address}:
 *   get:
 *     tags: [Admin]
 *     summary: Get detailed profile for a single user
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: Detailed user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/users/{address}/suspend:
 *   post:
 *     tags: [Admin]
 *     summary: Suspend a user
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Violation of terms of service"
 *     responses:
 *       200:
 *         description: User suspended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/users/{address}/ban:
 *   post:
 *     tags: [Admin]
 *     summary: Permanently ban a user
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Fraudulent activity"
 *     responses:
 *       200:
 *         description: User banned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/disputes:
 *   get:
 *     tags: [Admin]
 *     summary: List all disputes with pagination
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - name: resolved
 *         in: query
 *         description: Filter by resolution status
 *         schema:
 *           type: boolean
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated dispute list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/disputes/{id}/resolve:
 *   post:
 *     tags: [Admin]
 *     summary: Resolve an open dispute
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Dispute (escrow) ID
 *         schema:
 *           type: integer
 *           example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientAmount, freelancerAmount]
 *             properties:
 *               clientAmount:
 *                 type: string
 *                 description: Amount to release to client (in stroops)
 *                 example: "1000000000"
 *               freelancerAmount:
 *                 type: string
 *                 description: Amount to release to freelancer (in stroops)
 *                 example: "1000000000"
 *               notes:
 *                 type: string
 *                 example: "Split equally due to partial delivery"
 *     responses:
 *       200:
 *         description: Dispute resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Read current platform settings
 *     security:
 *       - AdminApiKey: []
 *     responses:
 *       200:
 *         description: Platform settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 platformFeePercent:
 *                   type: number
 *                   example: 2.5
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *   patch:
 *     tags: [Admin]
 *     summary: Update platform settings
 *     security:
 *       - AdminApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               platformFeePercent:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 example: 2.5
 *     responses:
 *       200:
 *         description: Settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 platformFeePercent:
 *                   type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Paginated audit log of all admin actions
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated admin audit log
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
