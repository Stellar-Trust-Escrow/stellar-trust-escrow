/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags: [Audit]
 *     summary: Search audit logs (admin only)
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - name: category
 *         in: query
 *         description: Filter by audit category
 *         schema:
 *           type: string
 *           example: "escrow"
 *       - name: action
 *         in: query
 *         description: Filter by action name
 *         schema:
 *           type: string
 *           example: "create"
 *       - name: actor
 *         in: query
 *         description: Filter by actor (user address or system)
 *         schema:
 *           type: string
 *       - name: resourceId
 *         in: query
 *         description: Filter by resource ID
 *         schema:
 *           type: string
 *       - name: from
 *         in: query
 *         description: ISO datetime — filter entries from this time
 *         schema:
 *           type: string
 *           format: date-time
 *           example: "2025-01-01T00:00:00Z"
 *       - name: to
 *         in: query
 *         description: ISO datetime — filter entries up to this time
 *         schema:
 *           type: string
 *           format: date-time
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *     responses:
 *       200:
 *         description: Paginated audit log entries
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
 *                         $ref: '#/components/schemas/AuditEntry'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/audit/export:
 *   get:
 *     tags: [Audit]
 *     summary: Export audit logs as CSV (admin only, max 10 000 rows)
 *     security:
 *       - AdminApiKey: []
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *       - name: action
 *         in: query
 *         schema:
 *           type: string
 *       - name: actor
 *         in: query
 *         schema:
 *           type: string
 *       - name: resourceId
 *         in: query
 *         schema:
 *           type: string
 *       - name: from
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: to
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: CSV file download
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: 'attachment; filename="audit-export-1234567890.csv"'
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * components:
 *   schemas:
 *     AuditEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         category:
 *           type: string
 *           example: "escrow"
 *         action:
 *           type: string
 *           example: "create"
 *         actor:
 *           type: string
 *           example: "GABC...XYZ"
 *         resourceId:
 *           type: string
 *           example: "42"
 *         metadata:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 */
