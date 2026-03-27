/**
 * @openapi
 * components:
 *   schemas:
 *     ComponentStatus:
 *       type: object
 *       required: [status]
 *       properties:
 *         status:
 *           type: string
 *           enum: [ok, degraded, error]
 *
 *     DatabaseComponent:
 *       allOf:
 *         - $ref: '#/components/schemas/ComponentStatus'
 *         - type: object
 *           properties:
 *             latencyMs:
 *               type: integer
 *               example: 3
 *             pool:
 *               type: object
 *               nullable: true
 *               properties:
 *                 activeConnections:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *             error:
 *               type: string
 *               nullable: true
 *
 *     CacheComponent:
 *       allOf:
 *         - $ref: '#/components/schemas/ComponentStatus'
 *         - type: object
 *           properties:
 *             backend:
 *               type: string
 *               enum: [redis, memory]
 *             hits:
 *               type: integer
 *             misses:
 *               type: integer
 *             hitRate:
 *               type: string
 *               example: "0.9500"
 *             memSize:
 *               type: integer
 *
 *     StellarComponent:
 *       allOf:
 *         - $ref: '#/components/schemas/ComponentStatus'
 *         - type: object
 *           properties:
 *             latencyMs:
 *               type: integer
 *             ledger:
 *               type: integer
 *               nullable: true
 *             rpcUrl:
 *               type: string
 *             error:
 *               type: string
 *               nullable: true
 *
 *     EmailComponent:
 *       allOf:
 *         - $ref: '#/components/schemas/ComponentStatus'
 *         - type: object
 *           properties:
 *             queueLength:
 *               type: integer
 *             pending:
 *               type: integer
 *             failed:
 *               type: integer
 *             error:
 *               type: string
 *               nullable: true
 *
 *     WebSocketComponent:
 *       allOf:
 *         - $ref: '#/components/schemas/ComponentStatus'
 *         - type: object
 *           properties:
 *             activeConnections:
 *               type: integer
 *             peakConnections:
 *               type: integer
 *             totalConnected:
 *               type: integer
 *             totalDisconnected:
 *               type: integer
 *             subscriptionsByTopic:
 *               type: object
 *               additionalProperties:
 *                 type: integer
 *
 *     HealthResponse:
 *       type: object
 *       required: [status, timestamp, uptime, version, components]
 *       properties:
 *         status:
 *           type: string
 *           enum: [ok, degraded, error]
 *           example: ok
 *         timestamp:
 *           type: string
 *           format: date-time
 *         uptime:
 *           type: integer
 *           description: Server uptime in seconds
 *           example: 3600
 *         version:
 *           type: string
 *           example: "0.1.0"
 *         components:
 *           type: object
 *           properties:
 *             db:
 *               $ref: '#/components/schemas/DatabaseComponent'
 *             cache:
 *               $ref: '#/components/schemas/CacheComponent'
 *             stellar:
 *               $ref: '#/components/schemas/StellarComponent'
 *             email:
 *               $ref: '#/components/schemas/EmailComponent'
 *             websocket:
 *               $ref: '#/components/schemas/WebSocketComponent'
 *
 *     LivenessResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: ok
 *         timestamp:
 *           type: string
 *           format: date-time
 *         uptime:
 *           type: integer
 *
 *     ReadinessResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [ok, degraded, error]
 *         timestamp:
 *           type: string
 *           format: date-time
 *         components:
 *           type: object
 *           properties:
 *             db:
 *               $ref: '#/components/schemas/DatabaseComponent'
 *             cache:
 *               $ref: '#/components/schemas/CacheComponent'
 *
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Comprehensive health check
 *     description: >
 *       Returns the health status of every application component — database,
 *       cache, Stellar network RPC, email queue, and WebSocket pool.
 *       Returns HTTP 200 for `ok` or `degraded`, HTTP 503 when a critical
 *       component (`db`) reports `error`.
 *     responses:
 *       200:
 *         description: Service is healthy or degraded but operational
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               status: ok
 *               timestamp: "2026-03-26T12:00:00.000Z"
 *               uptime: 3600
 *               version: "0.1.0"
 *               components:
 *                 db:
 *                   status: ok
 *                   latencyMs: 3
 *                   pool:
 *                     activeConnections: 5
 *                 cache:
 *                   status: ok
 *                   backend: redis
 *                   hits: 142
 *                   misses: 8
 *                   hitRate: "0.9467"
 *                 stellar:
 *                   status: ok
 *                   latencyMs: 240
 *                   ledger: 55432100
 *                 email:
 *                   status: ok
 *                   queueLength: 2
 *                   pending: 2
 *                   failed: 0
 *                 websocket:
 *                   status: ok
 *                   activeConnections: 17
 *                   peakConnections: 45
 *       503:
 *         description: Service degraded — critical dependency (db) unreachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *
 * /health/live:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     description: >
 *       Lightweight check confirming the process is alive and the event loop
 *       is responsive. Suitable for Kubernetes `livenessProbe`. Always 200.
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LivenessResponse'
 *
 * /health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     description: >
 *       Checks critical dependencies (database, cache) to decide whether the
 *       service can handle traffic. Returns HTTP 503 when the database is
 *       unavailable. Suitable for Kubernetes `readinessProbe` and load-balancer
 *       health checks.
 *     responses:
 *       200:
 *         description: Service is ready to serve traffic
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 *       503:
 *         description: Service is not ready — critical dependency unavailable
 */
