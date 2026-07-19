import { Queue } from 'bullmq';
import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

import { notificationsQueue } from '../queues/emailQueue.js';

/**
 * Render a template with data. Returns { subject?, body }.
 */
export async function renderTemplate(template, channel, data, locale = 'en') {
  try {
    const templatesDir = path.join(__dirname, '../templates/notifications');
    // Fallback to 'en' if specific locale doesn't exist
    let templatePath = path.join(templatesDir, `${template}.${channel}.${locale}.hbs`);
    
    try {
      await fs.access(templatePath);
    } catch (err) {
      // Fallback to 'en'
      templatePath = path.join(templatesDir, `${template}.${channel}.en.hbs`);
    }

    const templateContent = await fs.readFile(templatePath, 'utf-8');
    
    // Split into subject and body if email
    let subject = null;
    let bodyTemplateContent = templateContent;

    if (channel === 'email') {
      const match = templateContent.match(/^Subject:\s*(.+)\s*\n\n([\s\S]*)$/);
      if (match) {
        subject = Handlebars.compile(match[1].trim())(data);
        bodyTemplateContent = match[2];
      }
    }

    const compiledTemplate = Handlebars.compile(bodyTemplateContent);
    const body = compiledTemplate(data);

    return { subject, body };
  } catch (error) {
    logger.error(`Error rendering template ${template} for ${channel}:`, error);
    throw error;
  }
}

/**
 * Enqueue a notification. Returns job ID.
 */
export async function sendNotification({ userId, channel = 'email', template, data, locale = 'en' }) {
  if (!['email', 'sms'].includes(channel)) {
    throw new Error(`Invalid channel: ${channel}`);
  }

  // Check if template exists
  try {
    const templatesDir = path.join(__dirname, '../templates/notifications');
    const templatePath = path.join(templatesDir, `${template}.${channel}.en.hbs`);
    await fs.access(templatePath);
  } catch (e) {
    const err = new Error(`Template not found: ${template}`);
    err.status = 400;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId, 10) },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Verify preferences
  const prefs = user.notificationPreferences || { email: true, sms: false, templates: {} };
  
  if (prefs[channel] === false) {
    logger.info(`User ${userId} opted out of ${channel} notifications.`);
    return null; // Not enqueued
  }

  if (prefs.templates && prefs.templates[template] === false) {
    logger.info(`User ${userId} opted out of template ${template} via ${channel}.`);
    return null; // Not enqueued
  }

  // Format validation for SMS
  if (channel === 'sms') {
    const phoneData = data.phone || data.phoneNumber; // Assume phone is passed in data
    // Basic E.164 validation logic
    if (!phoneData || !/^\+[1-9]\d{1,14}$/.test(phoneData)) {
      const err = new Error(`Invalid phone format for SMS`);
      err.status = 400;
      throw err;
    }
  }

  // Create delivery record
  const deliveryRecord = await prisma.notificationDelivery.create({
    data: {
      userId: user.id,
      channel,
      template,
      status: 'queued',
    },
  });

  const job = await notificationsQueue.add('send-notification', {
    deliveryId: deliveryRecord.id,
    userId: user.id,
    channel,
    template,
    data,
    locale,
  });

  return job.id;
}
