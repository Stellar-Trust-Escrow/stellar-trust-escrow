import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { renderTemplate } from '../services/notificationService.js';
import { deliverEmail } from '../services/emailProviders.js';
import { deliverSms } from '../services/smsProviders.js';
import { logger } from '../config/logger.js';

const prisma = new PrismaClient();

const dlq = new Queue('notifications-dlq', {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

export const emailWorker = new Worker('notifications', async (job) => {
  const { deliveryId, userId, channel, template, data, locale } = job.data;
  
  try {
    // Update attempt count
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { attemptCount: { increment: 1 } }
    });

    // Render template
    const { subject, body } = await renderTemplate(template, channel, data, locale);

    // Fetch user for contact info
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    let result;
    if (channel === 'email') {
      result = await deliverEmail({
        to: user.email,
        subject,
        html: body,
        text: body, // Simple fallback
      });
    } else if (channel === 'sms') {
      const phone = data.phone || data.phoneNumber; // Assume passed via data
      if (!phone) {
        throw new Error('Phone number missing in data for SMS channel');
      }
      result = await deliverSms({
        to: phone,
        body,
      });
    } else {
      throw new Error(`Unsupported channel: ${channel}`);
    }

    if (result.success) {
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'delivered',
          messageId: result.messageId,
          deliveredAt: new Date(),
        }
      });
      logger.info(`Delivered ${channel} notification for deliveryId ${deliveryId}`);
      return result;
    } else {
      throw new Error(result.error || 'Unknown delivery error');
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}:`, error);

    // Check if it's the last attempt based on job options
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          error: error.message,
        }
      });
      // Dead letter queue
      await dlq.add('failed-notification', job.data);
    } else {
      // Just record the error for this attempt, status stays 'queued' 
      // or we can leave it as is so it retries.
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          error: error.message,
        }
      });
    }

    throw error;
  }
}, {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

emailWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed with error ${err.message}`);
});
