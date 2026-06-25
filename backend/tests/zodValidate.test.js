import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate, validateAll } from '../middleware/zodValidate.js';

function buildApp(schema, source = 'body') {
  const app = express();
  app.use(express.json());
  app.post('/test', validate(schema, source), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('validate() middleware', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    age: z.number().int().min(0),
  });

  it('passes when body matches the schema', async () => {
    const app = buildApp(schema);
    const res = await request(app).post('/test').send({ name: 'Alice', age: 30 }).expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when a required field is missing', async () => {
    const app = buildApp(schema);
    const res = await request(app).post('/test').send({ age: 30 }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toBeInstanceOf(Array);
  });

  it('returns structured error with field-level messages', async () => {
    const app = buildApp(schema);
    const res = await request(app).post('/test').send({ name: '', age: -1 }).expect(400);
    const fields = res.body.error.fields;
    expect(fields.some((f) => f.field === 'name')).toBe(true);
    expect(fields.some((f) => f.field === 'age')).toBe(true);
  });

  it('coerces valid values (schema transform)', async () => {
    const coercingSchema = z.object({
      count: z.number(),
    });
    const app = buildApp(coercingSchema);
    await request(app).post('/test').send({ count: 5 }).expect(200);
  });

  it('validates query params when source=query', async () => {
    const querySchema = z.object({
      page: z.string().optional(),
    });
    const app = express();
    app.get('/items', validate(querySchema, 'query'), (_req, res) => res.json({ ok: true }));
    await request(app).get('/items?page=2').expect(200);
  });

  it('validates params when source=params', async () => {
    const paramSchema = z.object({
      id: z.string().regex(/^\d+$/, 'id must be numeric'),
    });
    const app = express();
    app.get('/items/:id', validate(paramSchema, 'params'), (_req, res) => res.json({ ok: true }));

    await request(app).get('/items/42').expect(200);
    const res = await request(app).get('/items/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('validateAll() middleware', () => {
  it('validates body and query together', async () => {
    const bodySchema = z.object({ action: z.string().min(1) });
    const querySchema = z.object({ dry: z.enum(['true', 'false']).optional() });

    const app = express();
    app.use(express.json());
    app.post(
      '/run',
      ...validateAll({ body: bodySchema, query: querySchema }),
      (_req, res) => res.json({ ok: true }),
    );

    await request(app).post('/run?dry=true').send({ action: 'deploy' }).expect(200);
    await request(app).post('/run').send({}).expect(400);
  });
});
