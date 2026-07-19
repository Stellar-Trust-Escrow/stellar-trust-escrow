import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  escrowTemplate: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  default: prismaMock,
}));

const { default: templateController } = await import('../../api/controllers/templateController.js');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

const baseTemplate = {
  id: 'tpl_1',
  name: 'Monthly Retainer',
  description: 'A reusable retainer',
  createdBy: 'GOWNER',
  isPublic: false,
  templateData: { version: 1, escrow: { tokenAddress: 'usdc', totalAmount: '5000' }, milestones: [{ title: 'Kickoff', amount: '2500' }] },
  usageCount: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

const publicTemplate = { ...baseTemplate, id: 'tpl_pub', isPublic: true, createdBy: 'GOTHER' };

describe('templateController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveTemplate', () => {
    it('creates a template and returns 201 with an id', async () => {
      prismaMock.escrowTemplate.create.mockResolvedValue(baseTemplate);

      const req = {
        user: { address: 'GOWNER' },
        body: {
          name: 'Monthly Retainer',
          description: 'A reusable retainer',
          isPublic: false,
          templateData: { version: 1, escrow: { tokenAddress: 'usdc' }, milestones: [] },
        },
      };
      const res = createRes();

      await templateController.saveTemplate(req, res);

      expect(prismaMock.escrowTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Monthly Retainer',
            createdBy: 'GOWNER',
            isPublic: false,
          }),
        }),
      );
      expect(res.statusCode).toBe(201);
      expect(res.body.data.id).toBe('tpl_1');
    });

    it('returns 401 when the caller is not authenticated', async () => {
      const req = { user: undefined, body: { name: 'x', templateData: { version: 1 } } };
      const res = createRes();
      await templateController.saveTemplate(req, res);
      expect(res.statusCode).toBe(401);
    });

    it('rejects an invalid version with a validation error', async () => {
      const req = {
        user: { address: 'GOWNER' },
        body: { name: 'x', templateData: { version: 2, escrow: {}, milestones: [] } },
      };
      const res = createRes();
      await templateController.saveTemplate(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires a name', async () => {
      const req = {
        user: { address: 'GOWNER' },
        body: { name: '   ', templateData: { version: 1, escrow: {}, milestones: [] } },
      };
      const res = createRes();
      await templateController.saveTemplate(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('listTemplates', () => {
    it('returns own + public templates with pagination', async () => {
      prismaMock.escrowTemplate.findMany.mockResolvedValue([baseTemplate, publicTemplate]);
      prismaMock.escrowTemplate.count.mockResolvedValue(2);

      const req = { query: {}, user: { address: 'GOWNER' } };
      const res = createRes();

      await templateController.listTemplates(req, res);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.pagination.total).toBe(2);
      expect(res.body.data[0]).toHaveProperty('milestoneCount', 1);
    });

    it('scopes to public templates for anonymous callers', async () => {
      prismaMock.escrowTemplate.findMany.mockResolvedValue([publicTemplate]);
      prismaMock.escrowTemplate.count.mockResolvedValue(1);

      const req = { query: { scope: 'public' }, user: undefined };
      const res = createRes();

      await templateController.listTemplates(req, res);

      expect(prismaMock.escrowTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isPublic: true } }),
      );
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('getTemplate', () => {
    it('returns a public template to anyone', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(publicTemplate);
      const req = { params: { id: 'tpl_pub' }, user: undefined };
      const res = createRes();
      await templateController.getTemplate(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.id).toBe('tpl_pub');
    });

    it('returns a private template to its owner', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      const req = { params: { id: 'tpl_1' }, user: { address: 'GOWNER' } };
      const res = createRes();
      await templateController.getTemplate(req, res);
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 for a private template accessed by a non-owner', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      const req = { params: { id: 'tpl_1' }, user: { address: 'GSTRANGER' } };
      const res = createRes();
      await templateController.getTemplate(req, res);
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when the template does not exist', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(null);
      const req = { params: { id: 'missing' }, user: undefined };
      const res = createRes();
      await templateController.getTemplate(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('updateTemplate', () => {
    it('lets the owner update their template', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      prismaMock.escrowTemplate.update.mockResolvedValue({ ...baseTemplate, name: 'Renamed' });

      const req = {
        user: { address: 'GOWNER' },
        params: { id: 'tpl_1' },
        body: { name: 'Renamed' },
      };
      const res = createRes();
      await templateController.updateTemplate(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Renamed');
    });

    it('returns 403 when a non-owner tries to update', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      const req = {
        user: { address: 'GSTRANGER' },
        params: { id: 'tpl_1' },
        body: { name: 'Hijack' },
      };
      const res = createRes();
      await templateController.updateTemplate(req, res);
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when the template is missing', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(null);
      const req = {
        user: { address: 'GOWNER' },
        params: { id: 'missing' },
        body: { name: 'x' },
      };
      const res = createRes();
      await templateController.updateTemplate(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('deleteTemplate', () => {
    it('lets the owner delete their template', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      prismaMock.escrowTemplate.delete.mockResolvedValue(baseTemplate);
      const req = { user: { address: 'GOWNER' }, params: { id: 'tpl_1' } };
      const res = createRes();
      await templateController.deleteTemplate(req, res);
      expect(res.statusCode).toBe(204);
    });

    it('returns 403 for a non-owner', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      const req = { user: { address: 'GSTRANGER' }, params: { id: 'tpl_1' } };
      const res = createRes();
      await templateController.deleteTemplate(req, res);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('useTemplate', () => {
    it('increments usageCount and returns templateData', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(publicTemplate);
      prismaMock.escrowTemplate.update.mockResolvedValue({
        ...publicTemplate,
        usageCount: publicTemplate.usageCount + 1,
      });

      const req = { params: { id: 'tpl_pub' }, user: undefined };
      const res = createRes();
      await templateController.useTemplate(req, res);

      expect(prismaMock.escrowTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl_pub' },
        data: { usageCount: { increment: 1 } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.templateData).toEqual(publicTemplate.templateData);
    });

    it('returns 403 for a private template used by a non-owner', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(baseTemplate);
      const req = { params: { id: 'tpl_1' }, user: { address: 'GSTRANGER' } };
      const res = createRes();
      await templateController.useTemplate(req, res);
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when the template does not exist', async () => {
      prismaMock.escrowTemplate.findUnique.mockResolvedValue(null);
      const req = { params: { id: 'missing' }, user: undefined };
      const res = createRes();
      await templateController.useTemplate(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
