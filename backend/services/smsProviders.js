import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function deliverSms({ to, body }) {
  if (!client) {
    throw new Error('Twilio is not configured');
  }

  const message = await client.messages.create({
    body,
    from: fromPhone,
    to,
  });

  return { success: true, messageId: message.sid };
}
