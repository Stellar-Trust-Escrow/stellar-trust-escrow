import express from 'express';
import emailService from '../../services/emailService.js';

const router = express.Router();

function getBaseUrl() {
  return process.env.EMAIL_BASE_URL || 'http://localhost:4000';
}

function getDashboardUrl(eventType, data) {
  if (data.dashboardUrl) return data.dashboardUrl;
  if (eventType === 'dispute.raised') {
    return `${getBaseUrl()}/disputes/${data.escrowId}`;
  }
  return `${getBaseUrl()}/escrows/${data.escrowId}`;
}

async function enqueueNotification(eventType, data) {
  const payload = {
    ...data,
    dashboardUrl: getDashboardUrl(eventType, data),
  };

  switch (eventType) {
    case 'escrow.status_changed':
      return emailService.notifyEscrowStatusChange(payload);
    case 'milestone.completed':
      return emailService.notifyMilestoneCompleted(payload);
    case 'dispute.raised':
      return emailService.notifyDisputeRaised(payload);
    default:
      throw new Error('Unsupported notification event type');
  }
}

router.post('/events', async (req, res) => {
  try {
    const { eventType, data } = req.body || {};
    if (!eventType || !data || !Array.isArray(data.recipients) || data.recipients.length === 0) {
      return res.status(400).json({ error: 'eventType and data.recipients are required' });
    }

    const result = await enqueueNotification(eventType, data);
    return res.status(202).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/unsubscribe', async (req, res) => {
  try {
    const { email, token, reason } = req.query;
    if (!email || !token) {
      return res.status(400).send('<h1>Missing email or token</h1>');
    }

    await emailService.unsubscribe(email, token, reason);
    return res
      .status(200)
      .send('<h1>You have been unsubscribed from escrow notification emails.</h1>');
  } catch (error) {
    return res.status(400).send(`<h1>${error.message}</h1>`);
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, token, reason } = req.body || {};
    if (!email || !token) {
      return res.status(400).json({ error: 'email and token are required' });
    }

    const preference = await emailService.unsubscribe(email, token, reason);
    return res.json({ email: preference.email, unsubscribedAt: preference.unsubscribedAt });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const preference = await emailService.resubscribe(email);
    return res.json({ email: preference.email, unsubscribedAt: preference.unsubscribedAt });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/queue', async (_req, res) => {
  const snapshot = await emailService.getQueueSnapshot();
  res.json(snapshot);
});

export default router;
