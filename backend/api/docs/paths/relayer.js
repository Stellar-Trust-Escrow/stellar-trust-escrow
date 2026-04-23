/**
 * @openapi
 * /api/relayer/execute:
 *   post:
 *     tags: [Relayer]
 *     summary: Execute a meta-transaction (gasless interaction)
 *     description: |
 *       Submits a meta-transaction to the Stellar network on behalf of the user.
 *       The relayer pays the transaction fee, enabling gasless interactions with the escrow contract.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [metaTx]
 *             properties:
 *               metaTx:
 *                 type: object
 *                 description: Signed meta-transaction payload
 *               feeDelegation:
 *                 type: object
 *                 description: Optional fee delegation parameters
 *           examples:
 *             execute:
 *               summary: Execute a meta-transaction
 *               value:
 *                 metaTx:
 *                   nonce: 1
 *                   signature: "abc123..."
 *                   callData: "..."
 *     responses:
 *       200:
 *         description: Meta-transaction executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transactionHash:
 *                   type: string
 *                   example: "abc123def456..."
 *                 ledger:
 *                   type: integer
 *                   example: 1234567
 *                 nonce:
 *                   type: integer
 *                   example: 1
 *       400:
 *         description: Invalid meta-transaction or execution failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                 nonce:
 *                   type: integer
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/relayer/fee-estimate:
 *   post:
 *     tags: [Relayer]
 *     summary: Estimate the fee for a meta-transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [metaTx]
 *             properties:
 *               metaTx:
 *                 type: object
 *                 description: Meta-transaction payload to estimate fee for
 *     responses:
 *       200:
 *         description: Fee estimate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 estimatedFee:
 *                   type: string
 *                   description: Estimated fee in stroops
 *                   example: "100"
 *                 feeToken:
 *                   type: string
 *                   example: "XLM"
 *                 unit:
 *                   type: string
 *                   example: "stroops"
 *       400:
 *         description: Missing meta-transaction data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/relayer/status:
 *   get:
 *     tags: [Relayer]
 *     summary: Get relayer service status
 *     responses:
 *       200:
 *         description: Relayer status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "active"
 *                 network:
 *                   type: string
 *                   example: "testnet"
 *                 contractId:
 *                   type: string
 *                   example: "CABC...XYZ"
 *                 relayerAddress:
 *                   type: string
 *                   example: "GABC...XYZ"
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
