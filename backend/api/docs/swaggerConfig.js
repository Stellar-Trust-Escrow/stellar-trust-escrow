/**
 * Swagger / OpenAPI configuration for swagger-jsdoc.
 *
 * The full spec is assembled from:
 *  1. The `definition` object below (info, servers, tags, shared components).
 *  2. JSDoc @openapi annotations in the route files (apis glob).
 */

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Stellar Trust Escrow API',
    version: '1.0.0',
    description: `REST API for the StellarTrustEscrow platform — a decentralised escrow system built on the Stellar blockchain.

## Authentication

Most endpoints require a JWT Bearer token obtained via \`POST /api/auth/login\`.

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

Access tokens expire in **15 minutes**. Use \`POST /api/auth/refresh\` with your refresh token to obtain a new one.

## Rate Limiting

| Scope | Window | Limit |
|---|---|---|
| All \`/api/*\` endpoints | 1 min | 60 req |
| \`GET /api/reputation/leaderboard\` | 1 min | 30 req |

Exceeding the limit returns \`429 Too Many Requests\`.

## Pagination

All collection endpoints return a standard envelope:

\`\`\`json
{
  "data": [...],
  "page": 1,
  "limit": 20,
  "total": 42,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPreviousPage": false
}
\`\`\`
`,
    contact: {
      name: 'Stellar Trust Escrow',
      url: 'https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow',
    },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local development' },
    { url: 'https://api.stellartrustescrow.com', description: 'Production' },
  ],
  tags: [
    { name: 'Auth', description: 'Register, login, token refresh, logout' },
    { name: 'Escrows', description: 'Escrow lifecycle and milestone tracking' },
    { name: 'Users', description: 'User profiles, stats, and data export' },
    { name: 'Reputation', description: 'On-chain reputation scores and leaderboard' },
    { name: 'Disputes', description: 'Dispute listing and detail retrieval' },
    { name: 'Payments', description: 'Stripe-based fiat on-ramp and payment status' },
    { name: 'KYC', description: 'Know-Your-Customer verification via Sumsub' },
    { name: 'Events', description: 'Indexed Stellar contract events' },
    { name: 'Search', description: 'Full-text search over escrows via Elasticsearch' },
    { name: 'Notifications', description: 'Email notification dispatch and subscription management' },
    { name: 'Relayer', description: 'Meta-transaction relaying for gasless interactions' },
    { name: 'Audit', description: 'Admin-only audit log search and export (requires x-admin-api-key)' },
    { name: 'Admin', description: 'Platform administration — users, disputes, settings (requires x-admin-api-key)' },
    { name: 'Health', description: 'Liveness and readiness probes' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token obtained from POST /api/auth/login',
      },
      AdminApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-admin-api-key',
        description: 'Admin API key set via ADMIN_API_KEY environment variable',
      },
    },
    parameters: {
      Page: {
        name: 'page',
        in: 'query',
        description: '1-based page number (values below 1 are normalised to 1)',
        schema: { type: 'integer', default: 1, minimum: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        description: 'Page size — defaults to 20, capped at 100',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
      },
      StellarAddress: {
        name: 'address',
        in: 'path',
        required: true,
        description: 'Stellar public key (G…, 56 characters)',
        schema: { type: 'string', pattern: '^G[A-Z2-7]{55}$', example: 'GABC...XYZ' },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', example: 'Resource not found' },
          code: { type: 'string', example: 'ESCROW_NOT_FOUND' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        required: ['data', 'page', 'limit', 'total', 'totalPages', 'hasNextPage', 'hasPreviousPage'],
        properties: {
          data: { type: 'array', items: {} },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 3 },
          hasNextPage: { type: 'boolean', example: true },
          hasPreviousPage: { type: 'boolean', example: false },
        },
      },
      Milestone: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 0 },
          title: { type: 'string', example: 'Initial Designs' },
          amount: { type: 'string', example: '500000000', description: 'Amount in stroops' },
          status: { type: 'string', enum: ['Pending', 'Submitted', 'Approved', 'Disputed'], example: 'Approved' },
          submittedAt: { type: 'string', format: 'date-time', nullable: true },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Escrow: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          clientAddress: { type: 'string', example: 'GABC...XYZ' },
          freelancerAddress: { type: 'string', example: 'GXYZ...ABC' },
          arbiterAddress: { type: 'string', nullable: true, example: null },
          tokenAddress: { type: 'string', example: 'USDC_CONTRACT' },
          totalAmount: { type: 'string', example: '2000000000', description: 'Total in stroops' },
          remainingBalance: { type: 'string', example: '1500000000' },
          status: { type: 'string', enum: ['Active', 'Completed', 'Disputed', 'Cancelled'], example: 'Active' },
          briefHash: { type: 'string', nullable: true, example: 'QmIPFSHash...' },
          deadline: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time', example: '2025-03-01T00:00:00Z' },
          milestones: { type: 'array', items: { '$ref': '#/components/schemas/Milestone' } },
        },
      },
      ReputationRecord: {
        type: 'object',
        properties: {
          address: { type: 'string', example: 'GABC...XYZ' },
          totalScore: { type: 'number', example: 95.5 },
          completedEscrows: { type: 'integer', example: 12 },
          disputedEscrows: { type: 'integer', example: 1 },
          disputesWon: { type: 'integer', example: 1 },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid JWT token',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' }, example: { error: 'Access denied. No token provided.' } } },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' }, example: { error: 'Forbidden' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' }, example: { error: 'Not found' } } },
      },
      TooManyRequests: {
        description: 'Rate limit exceeded',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' }, example: { error: 'Too many API requests, please slow down and try again in a minute.', code: 'RATE_LIMIT_EXCEEDED' } } },
      },
      InternalError: {
        description: 'Unexpected server error',
        content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
      },
    },
  },
};

export const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [
    './api/routes/*.js',
    './api/docs/paths/*.js',
  ],
};

export default swaggerDefinition;
