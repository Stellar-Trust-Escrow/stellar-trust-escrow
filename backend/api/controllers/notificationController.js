import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getPreferences(req, res) {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.notificationPreferences || { email: true, sms: false, templates: {} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function updatePreferences(req, res) {
  try {
    const userId = req.user.id;
    const { email, sms, templates } = req.body;
    
    const prefs = { 
      email: typeof email === 'boolean' ? email : true, 
      sms: typeof sms === 'boolean' ? sms : false, 
      templates: templates || {} 
    };

    await prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: prefs },
    });
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
