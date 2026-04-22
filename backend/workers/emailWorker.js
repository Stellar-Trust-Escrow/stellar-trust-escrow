import { Worker } from 'bullmq';
import crypto from 'crypto';
import { connection } from '../queues/index.js';

import disputeRaisedTemplate from '../templates/emails/disputeRaised.js';
import escrowStatusChangedTemplate from '../templates/emails/escrowStatusChanged.js';
import milestoneCompletedTemplate from '../templates/emails/milestoneCompleted.js';

const config = {
  provider: process.env.EMAIL_PROVIDER || 'console',
  fromEmail: process.env.EMAIL_FROM || 'no-reply@stellartrustescrow.local',
  fromName: process.env.EMAIL_FROM_NAME || 'Stellar Trust Escrow',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
};

function createTemplate(eventType, payload) {
  switch (eventType) {
    case 'escrow.status_changed':
      return escrowStatusChangedTemplate(payload);
    case 'milestone.completed':
      return milestoneCompletedTemplate(payload);
    case 'dispute.raised':
      return disputeRaisedTemplate(payload);
    default:
      throw new Error(`Unsupported notification event type: ${eventType}`);
  }
}

async function sendWithProvider(message, eventType) {
  if (config.provider === 'console' || !config.sendgridApiKey) {
    console.log('[EmailWorker] Console delivery', {
      to: message.to.email,
      subject: message.subject,
      eventType,
    });
    return {
      provider: 'console',
      messageId: `console-${crypto.randomUUID()}`,
    };
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: message.to.email, name: message.to.name }],
          subject: message.subject,
        },
      ],
      from: {
        email: config.fromEmail,
        name: config.fromName,
      },
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
      custom_args: {
        eventType,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid failed: ${response.status} ${errorText}`);
  }

  return {
    provider: 'sendgrid',
    messageId: response.headers.get('x-message-id') || `sendgrid-${crypto.randomUUID()}`,
  };
}

const emailWorker = new Worker(
  'email',
  async (job) => {
    const { eventType, payload, recipients } = job.data;

    for (const rawRecipient of recipients) {
      const recipient = {
        email: rawRecipient.email.toLowerCase().trim(),
        name: rawRecipient.name || rawRecipient.address || rawRecipient.email,
      };

      const template = createTemplate(eventType, payload);
      const content = template({
        recipient,
        unsubscribeUrl: `/api/notifications/unsubscribe?email=${encodeURIComponent(recipient.email)}&token=TOKEN_PLACEHOLDER`, // Migrate unsubscribe logic later
        fromName: config.fromName,
      });

      const message = {
        to: recipient,
        subject: content.subject,
        text: content.text,
        html: content.html,
      };

      const result = await sendWithProvider(message, eventType);
      console.log(`[EmailWorker] Sent to ${recipient.email}: ${result.messageId}`);
    }
  },
  {
    connection,
  },
);

export default emailWorker;
