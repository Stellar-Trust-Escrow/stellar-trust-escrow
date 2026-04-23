import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { requestLogger } from '../lib/logger.js';

describe('requestLogger middleware', () => {
  it('assigns a unique request ID and exposes it in response headers', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/test', (req, res) => {
      res.json({ requestId: req.id });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('honors a provided X-Request-Id header', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/test', (req, res) => {
      res.json({ requestId: req.id });
    });

    const customRequestId = 'custom-id-123';
    const res = await request(app).get('/test').set('X-Request-Id', customRequestId);

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe(customRequestId);
    expect(res.headers['x-request-id']).toBe(customRequestId);
  });
});
