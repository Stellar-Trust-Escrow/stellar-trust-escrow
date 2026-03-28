/**
 * Dispute Controller
 *
 * Handles dispute resolution, evidence management, and appeals.
 * Evidence files are stored on IPFS with virus scanning and thumbnail generation.
 */

import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { uploadEvidence } from '../middleware/fileUpload.js';
import ipfsService from '../../services/ipfsService.js';
import { broadcastToDispute } from '../websocket/handlers.js';

const listDisputes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const {
      status,
      raisedBy,
      dateFrom,
      dateTo,
      sortBy = 'raisedAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {
      tenantId: req.tenant.id
    };

    if (status === 'resolved') {
      where.resolvedAt = { not: null };
    } else if (status === 'unresolved') {
      where.resolvedAt = null;
    }

    if (raisedBy) where.raisedByAddress = raisedBy;
    if (dateFrom || dateTo) {
      where.raisedAt = {};
      if (dateFrom) where.raisedAt.gte = new Date(dateFrom);
      if (dateTo) where.raisedAt.lte = new Date(dateTo);
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          escrow: {
            select: {
              clientAddress: true,
              freelancerAddress: true,
              totalAmount: true,
              status: true
            }
          },
          evidence: {
            select: {
              id: true,
              evidenceType: true,
              submittedBy: true,
              submittedAt: true,
              filename: true,
              ipfsCid: true,
              thumbnailCid: true,
              scanStatus: true
            },
            orderBy: { submittedAt: 'desc' }
          },
          _count: {
            select: { evidence: true, appeals: true }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit
      }),
      prisma.dispute.count({ where })
    ]);

    const response = buildPaginatedResponse({
      items: disputes,
      total,
      page,
      limit,
      request: req
    });

    res.json(response);
  } catch (error) {
    console.error('Error listing disputes:', error);
    res.status(500).json({ error: 'Failed to list disputes' });
  }
};

const getDispute = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const escrowIdBigInt = BigInt(escrowId);

    const dispute = await prisma.dispute.findFirst({
      where: {
        escrowId: escrowIdBigInt,
        tenantId: req.tenant.id
      },
      include: {
        escrow: {
          select: {
            clientAddress: true,
            freelancerAddress: true,
            arbiterAddress: true,
            tokenAddress: true,
            totalAmount: true,
            remainingBalance: true,
            status: true,
            deadline: true,
            createdAt: true
          }
        },
        evidence: {
          include: {
            _count: true
          },
          orderBy: { submittedAt: 'desc' }
        },
        appeals: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const evidenceWithUrls = await Promise.all(
      dispute.evidence.map(async (evidence) => {
        const evidenceData = { ...evidence };
        if (evidence.ipfsCid) {
          evidenceData.fileUrl = await ipfsService.getFileUrl(evidence.ipfsCid);
        }
        if (evidence.thumbnailCid) {
          evidenceData.thumbnailUrl = await ipfsService.getFileUrl(evidence.thumbnailCid);
        }
        return evidenceData;
      })
    );

    res.json({
      ...dispute,
      evidence: evidenceWithUrls
    });
  } catch (error) {
    console.error('Error getting dispute:', error);
    res.status(500).json({ error: 'Failed to get dispute' });
  }
};

const postEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, role } = req.body;
    const userAddress = req.user?.address;

    if (!userAddress) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const dispute = req.dispute;
    const uploadResults = req.ipfsUploadResults || [];
    const scanResults = req.virusScanResults || [];

    if (uploadResults.length === 0 && !description) {
      return res.status(400).json({ 
        error: 'No evidence provided',
        message: 'Either files or text description is required'
      });
    }

    const evidenceRecords = [];

    for (const uploadResult of uploadResults) {
      const scanResult = scanResults.find(s => s.originalname === uploadResult.originalname);
      
      const evidenceRecord = await prisma.disputeEvidence.create({
        data: {
          tenantId: req.tenant.id,
          disputeId: dispute.id,
          submittedBy: userAddress,
          role: role || determineUserRole(dispute, userAddress),
          evidenceType: uploadResult.metadata.mimeType.startsWith('image/') ? 'image' : 'file',
          content: uploadResult.ipfsCid,
          description: description || null,
          filename: uploadResult.originalname,
          mimeType: uploadResult.mimetype,
          fileSize: uploadResult.size,
          ipfsCid: uploadResult.ipfsCid,
          thumbnailCid: uploadResult.thumbnailCid,
          scanStatus: scanResult?.status || 'pending',
          scanResult: JSON.stringify(scanResult) || null
        }
      });

      evidenceRecords.push(evidenceRecord);
    }

    if (description && uploadResults.length === 0) {
      const textEvidence = await prisma.disputeEvidence.create({
        data: {
          tenantId: req.tenant.id,
          disputeId: dispute.id,
          submittedBy: userAddress,
          role: role || determineUserRole(dispute, userAddress),
          evidenceType: 'text',
          content: description,
          description: null
        }
      });

      evidenceRecords.push(textEvidence);
    }

    const evidenceWithUrls = await Promise.all(
      evidenceRecords.map(async (evidence) => {
        const evidenceData = { ...evidence };
        if (evidence.ipfsCid) {
          evidenceData.fileUrl = await ipfsService.getFileUrl(evidence.ipfsCid);
        }
        if (evidence.thumbnailCid) {
          evidenceData.thumbnailUrl = await ipfsService.getFileUrl(evidence.thumbnailCid);
        }
        return evidenceData;
      })
    );

    broadcastToDispute(dispute.id, {
      type: 'evidence_added',
      disputeId: dispute.id,
      evidence: evidenceWithUrls,
      submittedBy: userAddress,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Evidence uploaded successfully',
      evidence: evidenceWithUrls,
      count: evidenceRecords.length
    });

  } catch (error) {
    console.error('Error posting evidence:', error);
    res.status(500).json({ error: 'Failed to post evidence' });
  }
};

const listEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);
    const { evidenceType, submittedBy } = req.query;

    const where = {
      tenantId: req.tenant.id,
      disputeId: parseInt(id)
    };

    if (evidenceType) where.evidenceType = evidenceType;
    if (submittedBy) where.submittedBy = submittedBy;

    const [evidence, total] = await Promise.all([
      prisma.disputeEvidence.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.disputeEvidence.count({ where })
    ]);

    const evidenceWithUrls = await Promise.all(
      evidence.map(async (evidenceItem) => {
        const evidenceData = { ...evidenceItem };
        if (evidenceItem.ipfsCid) {
          evidenceData.fileUrl = await ipfsService.getFileUrl(evidenceItem.ipfsCid);
        }
        if (evidenceItem.thumbnailCid) {
          evidenceData.thumbnailUrl = await ipfsService.getFileUrl(evidenceItem.thumbnailCid);
        }
        return evidenceData;
      })
    );

    const response = buildPaginatedResponse({
      items: evidenceWithUrls,
      total,
      page,
      limit,
      request: req
    });

    res.json(response);
  } catch (error) {
    console.error('Error listing evidence:', error);
    res.status(500).json({ error: 'Failed to list evidence' });
  }
};

const autoResolve = async (req, res) => {
  try {
    const { id } = req.params;
    const dispute = req.dispute;

    const resolution = await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        resolvedAt: new Date(),
        resolvedBy: 'system',
        resolutionType: 'AUTO',
        autoResolved: true,
        resolution: 'Automatically resolved based on evidence and contract terms'
      }
    });

    broadcastToDispute(dispute.id, {
      type: 'dispute_resolved',
      disputeId: dispute.id,
      resolution: resolution,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Dispute auto-resolved successfully',
      resolution
    });
  } catch (error) {
    console.error('Error auto-resolving dispute:', error);
    res.status(500).json({ error: 'Failed to auto-resolve dispute' });
  }
};

const getRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    const dispute = req.dispute;

    const evidence = await prisma.disputeEvidence.findMany({
      where: {
        disputeId: dispute.id,
        tenantId: req.tenant.id
      },
      orderBy: { submittedAt: 'desc' }
    });

    const recommendation = generateResolutionRecommendation(dispute, evidence);

    res.json({
      disputeId: dispute.id,
      recommendation,
      evidenceCount: evidence.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting recommendation:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
};

const postAppeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userAddress = req.user?.address;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Appeal reason is required' });
    }

    const dispute = req.dispute;

    const appeal = await prisma.disputeAppeal.create({
      data: {
        tenantId: req.tenant.id,
        disputeId: dispute.id,
        appealedBy: userAddress,
        reason: reason.trim()
      }
    });

    broadcastToDispute(dispute.id, {
      type: 'appeal_filed',
      disputeId: dispute.id,
      appealId: appeal.id,
      appealedBy: userAddress,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Appeal filed successfully',
      appeal
    });
  } catch (error) {
    console.error('Error posting appeal:', error);
    res.status(500).json({ error: 'Failed to post appeal' });
  }
};

const patchAppeal = async (req, res) => {
  try {
    const { appealId } = req.params;
    const { status, reviewNotes } = req.body;
    const userAddress = req.user?.address;

    const appeal = await prisma.disputeAppeal.findFirst({
      where: {
        id: parseInt(appealId),
        tenantId: req.tenant.id
      }
    });

    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    const updatedAppeal = await prisma.disputeAppeal.update({
      where: { id: appeal.id },
      data: {
        status,
        reviewNotes,
        reviewedBy: userAddress,
        resolvedAt: status === 'approved' || status === 'rejected' ? new Date() : null
      }
    });

    res.json({
      message: 'Appeal updated successfully',
      appeal: updatedAppeal
    });
  } catch (error) {
    console.error('Error updating appeal:', error);
    res.status(500).json({ error: 'Failed to update appeal' });
  }
};

const getResolutionHistory = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where: {
          tenantId: req.tenant.id,
          resolvedAt: { not: null }
        },
        include: {
          escrow: {
            select: {
              clientAddress: true,
              freelancerAddress: true,
              totalAmount: true
            }
          }
        },
        orderBy: { resolvedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.dispute.count({
        where: {
          tenantId: req.tenant.id,
          resolvedAt: { not: null }
        }
      })
    ]);

    const response = buildPaginatedResponse({
      items: disputes,
      total,
      page,
      limit,
      request: req
    });

    res.json(response);
  } catch (error) {
    console.error('Error getting resolution history:', error);
    res.status(500).json({ error: 'Failed to get resolution history' });
  }
};

function determineUserRole(dispute, userAddress) {
  if (dispute.raisedByAddress === userAddress) {
    return dispute.escrow.clientAddress === userAddress ? 'client' : 'freelancer';
  }
  if (dispute.escrow.clientAddress === userAddress) return 'client';
  if (dispute.escrow.freelancerAddress === userAddress) return 'freelancer';
  return 'arbiter';
}

function generateResolutionRecommendation(dispute, evidence) {
  const clientEvidence = evidence.filter(e => e.role === 'client').length;
  const freelancerEvidence = evidence.filter(e => e.role === 'freelancer').length;
  const fileEvidence = evidence.filter(e => e.evidenceType === 'file' || e.evidenceType === 'image').length;

  let recommendation = {
    suggestedOutcome: 'manual_review',
    confidence: 0.5,
    reasoning: []
  };

  if (fileEvidence > 0) {
    recommendation.confidence += 0.2;
    recommendation.reasoning.push('Documentary evidence provided');
  }

  if (clientEvidence > freelancerEvidence + 2) {
    recommendation.suggestedOutcome = 'favor_client';
    recommendation.confidence += 0.1;
    recommendation.reasoning.push('Client provided significantly more evidence');
  } else if (freelancerEvidence > clientEvidence + 2) {
    recommendation.suggestedOutcome = 'favor_freelancer';
    recommendation.confidence += 0.1;
    recommendation.reasoning.push('Freelancer provided significantly more evidence');
  }

  recommendation.confidence = Math.min(recommendation.confidence, 0.9);

  return recommendation;
}

export default {
  listDisputes,
  getDispute,
  postEvidence,
  listEvidence,
  autoResolve,
  getRecommendation,
  postAppeal,
  patchAppeal,
  getResolutionHistory,
  uploadEvidence
};