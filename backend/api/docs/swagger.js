/**
 * Swagger UI setup for the Stellar Trust Escrow API.
 *
 * Mounts:
 *   GET /api/docs       — Swagger UI (interactive)
 *   GET /api/docs/json  — Raw OpenAPI JSON spec
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { swaggerOptions } from './swaggerConfig.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve api glob relative to the backend root (two levels up from this file)
const backendRoot = path.resolve(__dirname, '..', '..');

const resolvedOptions = {
  ...swaggerOptions,
  apis: [
    path.join(backendRoot, 'api', 'routes', '*.js'),
    path.join(backendRoot, 'api', 'docs', 'paths', '*.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(resolvedOptions);

/**
 * Attach Swagger UI and JSON spec endpoints to an Express app.
 * @param {import('express').Application} app
 */
export function setupSwagger(app) {
  // Serve raw OpenAPI JSON spec
  app.get('/api/docs/json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Serve interactive Swagger UI
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Stellar Trust Escrow API Docs',
      customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    }),
  );

  console.log('[Swagger] API docs available at /api/docs');
}

export { swaggerSpec };
