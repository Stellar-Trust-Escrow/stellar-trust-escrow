import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';

jest.mock('fs');

const mockOpenAPIYAML = `openapi: 3.0.0
info:
  title: Stellar Trust Escrow API
  version: 1.0.0
paths:
  /health:
    get:
      summary: Health check
`;

fs.readFileSync = jest.fn(() => mockOpenAPIYAML);

describe('Docs Routes and Security Checklist', () => {
  let app;
  let docsRouter;

  beforeEach(async () => {
    delete require.cache;
    app = express();
    docsRouter = (await import('../../docs/index.js')).default;
    app.use('/docs', docsRouter);
    app.use('/api-docs', docsRouter);
  });

  describe('Documentation Endpoints', () => {
    it('serves Swagger UI HTML on /docs root', async () => {
      const response = await request(app).get('/docs');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/text\/html/);
    });

    it('returns OpenAPI spec in YAML format', async () => {
      const response = await request(app).get('/docs/openapi.yaml');
      expect(response.status).toBe(200);
      expect(response.type).toBe('text/yaml');
      expect(response.text).toContain('openapi:');
    });

    it('returns OpenAPI spec in JSON format', async () => {
      const response = await request(app).get('/docs/openapi.json');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('openapi');
    });

    it('sets no-cache headers for API documentation', async () => {
      const yamlResponse = await request(app).get('/docs/openapi.yaml');
      const jsonResponse = await request(app).get('/docs/openapi.json');
      expect(yamlResponse.headers['cache-control']).toBe('no-cache');
      expect(jsonResponse.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('/api-docs Alias', () => {
    it('serves Swagger UI on /api-docs root path', async () => {
      const response = await request(app).get('/api-docs');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/text\/html/);
    });

    it('returns same content for /api-docs/openapi.yaml as /docs', async () => {
      const docsResponse = await request(app).get('/docs/openapi.yaml');
      const apiDocsResponse = await request(app).get('/api-docs/openapi.yaml');
      expect(docsResponse.status).toBe(apiDocsResponse.status);
      expect(docsResponse.text).toBe(apiDocsResponse.text);
    });

    it('returns same JSON for /api-docs/openapi.json as /docs', async () => {
      const docsResponse = await request(app).get('/docs/openapi.json');
      const apiDocsResponse = await request(app).get('/api-docs/openapi.json');
      expect(JSON.stringify(docsResponse.body)).toBe(
        JSON.stringify(apiDocsResponse.body),
      );
    });
  });

  describe('Content Type and Cache Headers', () => {
    it('sets correct content-type for YAML endpoint', async () => {
      const response = await request(app).get('/docs/openapi.yaml');
      expect(response.headers['content-type']).toBe('text/yaml');
    });

    it('sets correct content-type for JSON endpoint', async () => {
      const response = await request(app).get('/docs/openapi.json');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('applies cache control to /api-docs alias endpoints', async () => {
      const yamlResponse = await request(app).get('/api-docs/openapi.yaml');
      const jsonResponse = await request(app).get('/api-docs/openapi.json');
      expect(yamlResponse.headers['cache-control']).toBe('no-cache');
      expect(jsonResponse.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('Security Checklist Documentation', () => {
    it('API documentation includes OpenAPI structure for security validation', async () => {
      const response = await request(app).get('/docs/openapi.json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
    });

    it('YAML endpoint serves valid OpenAPI format for security audits', async () => {
      const response = await request(app).get('/docs/openapi.yaml');
      expect(response.status).toBe(200);
      expect(response.text).toContain('openapi: 3.0.0');
      expect(response.text).toContain('info:');
      expect(response.text).toContain('paths:');
    });

    it('documentation endpoints are accessible for security checklist verification', async () => {
      const swaggerResponse = await request(app).get('/docs');
      const yamlResponse = await request(app).get('/docs/openapi.yaml');
      const jsonResponse = await request(app).get('/docs/openapi.json');

      expect(swaggerResponse.status).toBe(200);
      expect(yamlResponse.status).toBe(200);
      expect(jsonResponse.status).toBe(200);
    });

    it('security endpoint alias /api-docs is available for compliance requirements', async () => {
      const response = await request(app).get('/api-docs');
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('handles multiple requests to documentation endpoints', async () => {
      const response1 = await request(app).get('/docs');
      const response2 = await request(app).get('/docs');
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });

    it('serves documentation consistently across requests', async () => {
      const response1 = await request(app).get('/docs/openapi.json');
      const response2 = await request(app).get('/docs/openapi.json');
      expect(response1.status).toBe(response2.status);
      expect(JSON.stringify(response1.body)).toBe(JSON.stringify(response2.body));
    });
  });
});
