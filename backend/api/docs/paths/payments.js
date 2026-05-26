/**
 * @openapi
 * /api/payments/checkout:
 *   post:
 *     tags: [Payments]
 *     summary: Create a Stripe Checkout session
 *     description: Initiates a fiat on-ramp via Stripe. Requires the user to have an Approved KYC status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address, amountUsd]
 *             properties:
 *               address:
 *                 type: string
 *                 description: Stellar public key of the payer
 *                 example: "GABC...XYZ"
 *               amountUsd:
 *                 type: number
 *                 description: Amount in USD
 *                 example: 100
 *               escrowId:
 *                 type: string
 *                 description: Optional escrow ID to associate the payment with
 *                 example: "42"
 *           examples:
 *             basic:
 *               summary: Fund an escrow
 *               value:
 *                 address: "GABC...XYZ"
 *                 amountUsd: 100
 *                 escrowId: "42"
 *     responses:
 *       200:
 *         description: Stripe Checkout session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   example: "cs_test_abc123..."
 *                 url:
 *                   type: string
 *                   format: uri
 *                   example: "https://checkout.stripe.com/pay/cs_test_abc123..."
 *       400:
 *         description: Missing fields or KYC not approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               kycRequired:
 *                 value: { error: "KYC verification required before making payments" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/payments/status/{sessionId}:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment record by Stripe session ID
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         description: Stripe Checkout session ID
 *         schema:
 *           type: string
 *           example: "cs_test_abc123..."
 *     responses:
 *       200:
 *         description: Payment record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 sessionId:
 *                   type: string
 *                 address:
 *                   type: string
 *                 amountUsd:
 *                   type: number
 *                 status:
 *                   type: string
 *                   enum: [pending, completed, failed, refunded]
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/payments/{address}:
 *   get:
 *     tags: [Payments]
 *     summary: List all payments for a Stellar address
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: List of payments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   amountUsd:
 *                     type: number
 *                   status:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/payments/{paymentId}/refund:
 *   post:
 *     tags: [Payments]
 *     summary: Issue a full refund for a completed payment
 *     parameters:
 *       - name: paymentId
 *         in: path
 *         required: true
 *         description: Internal payment record ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 refundId:
 *                   type: string
 *       400:
 *         description: Payment not eligible for refund
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Stripe webhook receiver
 *     description: Receives Stripe webhook events to update payment status. The request body must be the raw payload for signature verification. This endpoint is called by Stripe, not by API consumers.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Stripe event object
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature or payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
