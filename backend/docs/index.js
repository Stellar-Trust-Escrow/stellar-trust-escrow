import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, '../openapi.yaml');
const spec = YAML.parse(fs.readFileSync(specPath, 'utf8'));

const router = express.Router();

const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { font-size: 2em; font-weight: 600; }
    .swagger-ui .scheme-container { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px; }
    .swagger-ui .opblock-tag { font-size: 1.1em; }
    .swagger-ui .opblock-summary-get { background: #dbeafe; border-color: #3b82f6; }
    .swagger-ui .opblock-summary-post { background: #dcfce7; border-color: #22c55e; }
    .swagger-ui .opblock-summary-patch { background: #fef9c3; border-color: #eab308; }
    .swagger-ui .opblock-summary-delete { background: #fee2e2; border-color: #ef4444; }
    .swagger-ui .opblock-summary-put { background: #f3e8ff; border-color: #a855f7; }
  `,
  customSiteTitle: 'Stellar Trust Escrow API',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
    supportedSubmitMethods: ['get', 'post', 'put', 'patch', 'delete'],
  },
  includedPaths: ['/api/', '/health'],
};

router.use('/', swaggerUi.serve, swaggerUi.setup(spec, swaggerOptions));

router.get('/openapi.yaml', (_req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(fs.readFileSync(specPath, 'utf8'));
});

router.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  res.json(spec);
});

export default router;
