import webhookService from '../../services/webhookService.js';

const MAX_EVENT_TYPES = 20;
const ALLOWED_SCHEMES = ['https:'];

function isValidWebhookUrl(raw) {
  try {
    const parsed = new URL(raw);
    return ALLOWED_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

const subscribe = async (req, res) => {
  try {
    const { url, eventTypes } = req.body;

    if (!url || !isValidWebhookUrl(url)) {
      return res.status(400).json({ error: 'url must be a valid HTTPS URL' });
    }

    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      return res.status(400).json({ error: 'eventTypes must be a non-empty array' });
    }

    if (eventTypes.length > MAX_EVENT_TYPES) {
      return res
        .status(400)
        .json({ error: `eventTypes may not exceed ${MAX_EVENT_TYPES} entries` });
    }

    const result = await webhookService.createSubscription({
      url,
      eventTypes: eventTypes.slice(0, MAX_EVENT_TYPES),
      createdBy: req.user?.address || null,
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listSubscriptions = async (req, res) => {
  try {
    const subscriptions = await webhookService.listSubscriptions({
      createdBy: req.user?.address || null,
    });
    res.json({ data: subscriptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteSubscription = async (req, res) => {
  try {
    const deleted = await webhookService.deleteSubscription({
      id: req.params.id,
      createdBy: req.user?.address || null,
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Webhook subscription not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDeliveries = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 30), 100);

    const result = await webhookService.getDeliveryHistory({
      subscriptionId: req.params.id,
      createdBy: req.user?.address || null,
      page,
      limit,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  subscribe,
  listSubscriptions,
  deleteSubscription,
  getDeliveries,
};
