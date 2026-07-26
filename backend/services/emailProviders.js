import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { logger } from '../config/logger.js'; // Assuming logger exists

// Configured via env vars: EMAIL_PROVIDER ('smtp'|'sendgrid'|'mailgun')
const PRIMARY_PROVIDER = process.env.EMAIL_PROVIDER || 'smtp';

const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const mailgun = new Mailgun(formData);
const mgClient = process.env.MAILGUN_API_KEY
  ? mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY })
  : null;

const PROVIDERS = ['smtp', 'sendgrid', 'mailgun'];

async function sendViaSmtp({ to, subject, html, text }) {
  const info = await smtpTransporter.sendMail({
    from: process.env.EMAIL_FROM || '"Stellar Trust Escrow" <no-reply@stellartrust.com>',
    to,
    subject,
    text,
    html,
  });
  return { success: true, messageId: info.messageId };
}

async function sendViaSendgrid({ to, subject, html, text }) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SendGrid API key not configured');
  }
  const [response] = await sgMail.send({
    to,
    from: process.env.EMAIL_FROM || 'no-reply@stellartrust.com',
    subject,
    text,
    html,
  });
  return { success: true, messageId: response.headers['x-message-id'] || 'sg-delivered' };
}

async function sendViaMailgun({ to, subject, html, text }) {
  if (!mgClient || !process.env.MAILGUN_DOMAIN) {
    throw new Error('Mailgun not configured');
  }
  const messageData = {
    from: process.env.EMAIL_FROM || 'no-reply@stellartrust.com',
    to,
    subject,
    text,
    html,
  };
  const res = await mgClient.messages.create(process.env.MAILGUN_DOMAIN, messageData);
  return { success: true, messageId: res.id };
}

/**
 * Try providers in order: primary -> fallback.
 * @returns { success: boolean, messageId?, error? }
 */
export async function deliverEmail({ to, subject, html, text }) {
  const tryOrder = [
    PRIMARY_PROVIDER,
    ...PROVIDERS.filter((p) => p !== PRIMARY_PROVIDER),
  ];

  let lastError = null;

  for (const provider of tryOrder) {
    try {
      if (provider === 'smtp') {
        return await sendViaSmtp({ to, subject, html, text });
      } else if (provider === 'sendgrid') {
        return await sendViaSendgrid({ to, subject, html, text });
      } else if (provider === 'mailgun') {
        return await sendViaMailgun({ to, subject, html, text });
      }
    } catch (error) {
      logger.warn(`Email provider '${provider}' failed: ${error.message}. Trying next...`);
      lastError = error;
    }
  }

  logger.error(`All email providers failed for message to ${to}`);
  return { success: false, error: lastError?.message || 'All providers failed' };
}
