import { emailQueue } from './index.js';

export async function notifyEscrowStatusChange(payload) {
  return emailQueue.add('escrow.status_changed', { payload, recipients: payload.recipients });
}

export async function notifyMilestoneCompleted(payload) {
  return emailQueue.add('milestone.completed', { payload, recipients: payload.recipients });
}

export async function notifyDisputeRaised(payload) {
  return emailQueue.add('dispute.raised', { payload, recipients: payload.recipients });
}

export async function enqueueEvent(eventType, payload) {
  const job = await emailQueue.add(eventType, { payload, recipients: payload.recipients });
  return {
    queued: 1,
    accepted: [{ id: job.id, eventType }],
    skipped: [],
  };
}

export async function getQueueSnapshot() {
  const [waiting, active, failed] = await Promise.all([
    emailQueue.getWaiting(),
    emailQueue.getActive(),
    emailQueue.getFailed(),
  ]);
  return {
    queue: [...waiting, ...active],
    deliveries: [], // Track separately if needed
  };
}

export default {
  notifyEscrowStatusChange,
  notifyMilestoneCompleted,
  notifyDisputeRaised,
  enqueueEvent,
  getQueueSnapshot,
};
