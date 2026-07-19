/**
 * Escrow Template Controller
 *
 * Implements the REST API for saving, loading and sharing escrow wizard
 * templates.
 *
 *   POST   /api/v1/templates            → save current wizard state as template
 *   GET    /api/v1/templates            → list own + public templates (paginated)
 *   GET    /api/v1/templates/:id        → get a single template
 *   PUT    /api/v1/templates/:id        → update (owner only)
 *   DELETE /api/v1/templates/:id        → delete (owner only)
 *   POST   /api/v1/templates/:id/use    → increment usageCount, return templateData
 *
 * A template is private by default. Public templates (isPublic = true) may be
 * read by anyone; private templates return 403 to non-owners. The wizard state
 * lives in `templateData` as JSON:
 *
 *   { version: 1, escrow: { tokenAddress, totalAmount, deadline, briefHash },
 *     milestones: [{ title, amount }], settings: { arbiterAddress? } }
 */

import prisma from '../../lib/prisma.js';
import { parsePagination, buildPaginatedResponse } from '../../lib/pagination.js';

/** Send a structured error envelope (mirrors lib/responseHelpers.error). */
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

const SUPPORTED_VERSION = 1;

/**
 * Coerce a stored EscrowTemplate into the DTO the UI expects. Adds a
 * milestoneCount and a lastUsedAt (we repurpose updatedAt since there is no
 * dedicated "last used" column).
 */
function toDto(template) {
  const milestones = Array.isArray(template?.templateData?.milestones)
    ? template.templateData.milestones
    : [];
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    createdBy: template.createdBy,
    isPublic: template.isPublic,
    templateData: template.templateData,
    usageCount: template.usageCount,
    milestoneCount: milestones.length,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    lastUsedAt: template.updatedAt,
  };
}

/** True when `template` is visible to the given user (public or owner). */
function isAccessible(template, user) {
  if (template.isPublic) return true;
  return Boolean(user && template.createdBy === user.address);
}

/** Build the Prisma `where` for a list request given the caller + query. */
function buildListWhere(user, { scope, search } = {}) {
  const conditions = [];

  // Scope: 'mine' → only own, 'public' → only public, default → own + public.
  if (scope === 'mine') {
    conditions.push({ createdBy: user?.address ?? '__nobody__' });
  } else if (scope === 'public') {
    conditions.push({ isPublic: true });
  } else if (user?.address) {
    conditions.push({ OR: [{ createdBy: user.address }, { isPublic: true }] });
  } else {
    // Unauthenticated callers only ever see public templates.
    conditions.push({ isPublic: true });
  }

  if (search && search.trim()) {
    conditions.push({ name: { contains: search.trim(), mode: 'insensitive' } });
  }

  return conditions.length === 1 ? conditions[0] : { AND: conditions };
}

/** Validate the create/update payload; throws a 400-shaped error if invalid. */
function assertValidPayload({ name, templateData }) {
  if (!name || !name.trim()) {
    const err = new Error('Template name is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!templateData || typeof templateData !== 'object') {
    const err = new Error('templateData is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (templateData.version !== SUPPORTED_VERSION) {
    const err = new Error(`Unsupported template version. Expected ${SUPPORTED_VERSION}.`);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

export async function saveTemplate(req, res) {
  try {
    const user = req.user;
    if (!user?.address) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const { name, description, isPublic, templateData } = req.body || {};
    assertValidPayload({ name, templateData });

    const template = await prisma.escrowTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        createdBy: user.address,
        isPublic: Boolean(isPublic),
        templateData,
      },
    });

    return res.status(201).json({ data: toDto(template) });
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.code, err.message);
    return sendError(res, 400, 'INVALID_REQUEST', err.message);
  }
}

export async function listTemplates(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const scope = req.query.scope;
    const search = typeof req.query.search === 'string' ? req.query.search : '';

    const where = buildListWhere(req.user, { scope, search });

    const [templates, total] = await Promise.all([
      prisma.escrowTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.escrowTemplate.count({ where }),
    ]);

    const pagination = buildPaginatedResponse(templates, { page, limit, total });

    return res.json({
      data: templates.map(toDto),
      meta: { timestamp: new Date().toISOString(), pagination },
    });
  } catch (err) {
    return sendError(res, 400, 'INVALID_REQUEST', err.message);
  }
}

export async function getTemplate(req, res) {
  try {
    const { id } = req.params;
    const template = await prisma.escrowTemplate.findUnique({ where: { id } });

    if (!template) {
      return sendError(res, 404, 'NOT_FOUND', 'Template not found.');
    }
    if (!isAccessible(template, req.user)) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have access to this template.');
    }

    return res.json({ data: toDto(template) });
  } catch (err) {
    return sendError(res, 400, 'INVALID_REQUEST', err.message);
  }
}

export async function updateTemplate(req, res) {
  try {
    const user = req.user;
    if (!user?.address) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const { id } = req.params;
    const existing = await prisma.escrowTemplate.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND', 'Template not found.');
    }
    if (existing.createdBy !== user.address) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only edit your own templates.');
    }

    const { name, description, isPublic, templateData } = req.body || {};
    // Only validate templateData when it is actually being replaced.
    if (templateData !== undefined) {
      assertValidPayload({ name: name ?? existing.name, templateData });
    }

    const updated = await prisma.escrowTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description.trim() || null } : {}),
        ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
        ...(templateData !== undefined ? { templateData } : {}),
      },
    });

    return res.json({ data: toDto(updated) });
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.code, err.message);
    return sendError(res, 400, 'INVALID_REQUEST', err.message);
  }
}

export async function deleteTemplate(req, res) {
  try {
    const user = req.user;
    if (!user?.address) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const { id } = req.params;
    const existing = await prisma.escrowTemplate.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND', 'Template not found.');
    }
    if (existing.createdBy !== user.address) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only delete your own templates.');
    }

    await prisma.escrowTemplate.delete({ where: { id } });
    return res.status(204).end();
  } catch (err) {
    return sendError(res, 400, 'INVALID_REQUEST', err.message);
  }
}

export async function useTemplate(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.escrowTemplate.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND', 'Template not found.');
    }
    if (!isAccessible(existing, req.user)) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have access to this template.');
    }

    const updated = await prisma.escrowTemplate.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });

    return res.json({
      data: {
        id: updated.id,
        usageCount: updated.usageCount,
        templateData: updated.templateData,
      },
    });
  } catch (err) {
    return sendError(res, 400, 'INVALID_REQUEST', err.message);
  }
}

export default {
  saveTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate,
};
