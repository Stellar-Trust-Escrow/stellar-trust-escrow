/**
 * @openapi
 * /api/kyc/token:
 *   post:
 *     tags: [KYC]
 *     summary: Generate a Sumsub SDK access token for the frontend widget
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: string
 *                 description: Stellar public key of the user
 *                 example: "GABC...XYZ"
 *     responses:
 *       200:
 *         description: Sumsub SDK token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: Short-lived Sumsub access token for the frontend widget
 *                   example: "sbx:abc123..."
 *                 userId:
 *                   type: string
 *                   example: "GABC...XYZ"
 *       400:
 *         description: Missing address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/kyc/status/{address}:
 *   get:
 *     tags: [KYC]
 *     summary: Get KYC verification status for a Stellar address
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: KYC status record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   example: "GABC...XYZ"
 *                 status:
 *                   type: string
 *                   enum: [Pending, Init, Processing, Approved, Declined]
 *                   example: "Approved"
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/kyc/webhook:
 *   post:
 *     tags: [KYC]
 *     summary: Sumsub webhook — updates KYC verification status
 *     description: Called by Sumsub when a verification review is completed. The raw body is used for HMAC signature verification. This endpoint is called by Sumsub, not by API consumers.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Sumsub webhook event payload
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/kyc/admin:
 *   get:
 *     tags: [KYC]
 *     summary: Admin — list all KYC records
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by KYC status
 *         schema:
 *           type: string
 *           enum: [Pending, Init, Processing, Approved, Declined]
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated KYC records
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
