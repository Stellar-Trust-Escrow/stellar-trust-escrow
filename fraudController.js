import { PrismaClient } from '@prisma/client';
import * as fraudService from '../../services/fraudDetector.js';

const prisma = new PrismaClient();

export async function getFraudCases(req, res, next) {
  try {
    const { status, score_gte, score_lte, page = 1, limit = 20 } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }
    if (score_gte) {
      where.score = { ...where.score, gte: parseInt(score_gte, 10) };
    }
    if (score_lte) {
      where.score = { ...where.score, lte: parseInt(score_lte, 10) };
    }

    const cases = await prisma.fraudCase.findMany({
      where,
      skip: (page - 1) * limit,
      take: parseInt(limit, 10),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { address: true } } },
    });

    const totalCases = await prisma.fraudCase.count({ where });

    res.json({
      data: cases,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: totalCases,
        totalPages: Math.ceil(totalCases / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getFraudCaseById(req, res, next) {
  try {
    const { id } = req.params;
    const caseItem = await prisma.fraudCase.findUnique({
      where: { id },
      include: { user: { select: { address: true, createdAt: true } } },
    });

    if (!caseItem) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Case not found' });
    }

    res.json(caseItem);
  } catch (error) {
    next(error);
  }
}

export async function resolveFraudCase(req, res, next) {
  try {
    const { id } = req.params;
    const { resolution } = req.body;
    // Assuming admin user ID is available on req.user from adminAuth middleware
    const resolvedBy = req.user.id;

    const updatedCase = await fraudService.resolveCase(id, resolution, resolvedBy);
    res.status(200).json(updatedCase);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ code: 'INVALID_RESOLUTION', message: error.message });
    }
    next(error);
  }
}