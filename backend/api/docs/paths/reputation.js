/**
 * @openapi
 * /api/reputation/leaderboard:
 *   get:
 *     tags: [Reputation]
 *     summary: Top users by reputation score (paginated)
 *     description: Returns the leaderboard of users ranked by their on-chain reputation score. This endpoint has a stricter rate limit of 30 requests per minute.
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated leaderboard
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
 *                         $ref: '#/components/schemas/ReputationRecord'
 *             example:
 *               data:
 *                 - address: "GABC...XYZ"
 *                   totalScore: 98.2
 *                   completedEscrows: 25
 *                   disputedEscrows: 0
 *                   disputesWon: 0
 *               page: 1
 *               limit: 20
 *               total: 150
 *               totalPages: 8
 *               hasNextPage: true
 *               hasPreviousPage: false
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/reputation/{address}:
 *   get:
 *     tags: [Reputation]
 *     summary: Get the full reputation record for a Stellar address
 *     parameters:
 *       - $ref: '#/components/parameters/StellarAddress'
 *     responses:
 *       200:
 *         description: Reputation record (returns default zeroed record if not found)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReputationRecord'
 *             example:
 *               address: "GABC...XYZ"
 *               totalScore: 95.5
 *               completedEscrows: 12
 *               disputedEscrows: 1
 *               disputesWon: 1
 *               updatedAt: "2025-03-01T00:00:00Z"
 *       400:
 *         description: Invalid Stellar address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
