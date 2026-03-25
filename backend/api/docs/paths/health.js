/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness and readiness check
 *     description: Returns the health status of the API including database connectivity, cache stats, and WebSocket pool metrics. Returns 503 if the database is unreachable.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, degraded]
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: integer
 *                   description: Server uptime in seconds
 *                   example: 3600
 *                 cache:
 *                   type: object
 *                   description: In-memory cache analytics
 *                 websocket:
 *                   type: object
 *                   description: WebSocket connection pool metrics
 *                 db:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [ok, error]
 *                     latencyMs:
 *                       type: integer
 *                       nullable: true
 *                       example: 3
 *                     pool:
 *                       type: object
 *                       nullable: true
 *             example:
 *               status: "ok"
 *               timestamp: "2025-03-25T12:00:00Z"
 *               uptime: 3600
 *               db:
 *                 status: "ok"
 *                 latencyMs: 3
 *       503:
 *         description: Service degraded — database unreachable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "degraded"
 *                 db:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "error"
 */
