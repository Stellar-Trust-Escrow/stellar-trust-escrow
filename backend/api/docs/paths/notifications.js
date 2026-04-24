/**
 * @openapi
 * /api/notifications/events:
 *   post:
 *     tags: [Notifications]
 *     summary: Dispatch an email notification event
 *     description: |
 *       Enqueues an email notification for the given event type.
 *       Supported event types:
 *       - `escrow.status_changed` — notifies parties when escrow status changes
 *       - `milestone.completed` — notifies client when a milestone is submitted
 *       - `dispute.raised` — notifies all parties when a dispute is opened
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventType, data]
 *             properties:
 *               eventType:
 *                 type: string
 *                 enum: [escrow.status_changed, milestone.completed, dispute.raised]
 *                 example: "milestone.completed"
 *               data:
 *                 type: object
 *                 required: [recipients]
 *                 properties:
 *                   recipients:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: email
 *                     example: ["user@example.com"]
 *                   escrowId:
 *                     type: string
 *                     example: "42"
 *                   dashboardUrl:
 *                     type: string
 *                     format: uri
 *           examples:
 *             milestoneCompleted:
 *               summary: Milestone completed notification
 *               value:
 *                 eventType: "milestone.completed"
 *                 data:
 *                   recipients: ["client@example.com"]
 *                   escrowId: "42"
 *                   milestoneTitle: "Initial Designs"
 *     responses:
 *       202:
 *         description: Notification enqueued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Missing required fields or unsupported event type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/notifications/unsubscribe:
 *   get:
 *     tags: [Notifications]
 *     summary: Unsubscribe from email notifications (link-based)
 *     description: Used by the unsubscribe link in emails. Returns an HTML confirmation page.
 *     parameters:
 *       - name: email
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *       - name: token
 *         in: query
 *         required: true
 *         description: Unsubscribe token from the email link
 *         schema:
 *           type: string
 *       - name: reason
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unsubscribed — HTML confirmation page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: Missing email or token
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *   post:
 *     tags: [Notifications]
 *     summary: Unsubscribe from email notifications (API)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, token]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               token:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                 unsubscribedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing email or token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/notifications/subscribe:
 *   post:
 *     tags: [Notifications]
 *     summary: Re-subscribe to email notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Re-subscribed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                 unsubscribedAt:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Missing email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *
 * /api/notifications/queue:
 *   get:
 *     tags: [Notifications]
 *     summary: Get a snapshot of the email queue
 *     responses:
 *       200:
 *         description: Queue snapshot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pending:
 *                   type: integer
 *                 processing:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
