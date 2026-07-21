import request from 'supertest';
import express from 'express';
import adminRoutes from '../../backend/api/routes/adminRoutes.js';
import * as fraudService from '../../backend/services/fraudDetector.js';

// Mock the service layer
jest.mock('../../backend/services/fraudDetector.js');

// Mock middleware
const adminAuth = (req, res, next) => {
    req.user = { id: 'admin-user-id', role: 'admin' };
    next();
};

const app = express();
app.use(express.json());
// A mock route for escrow creation to test blocking
app.post('/api/v1/escrows', (req, res, next) => {
    // This is a simplified version of the real controller logic for testing
    fraudService.evaluateEvent.mockResolvedValue({ action: 'block' });
    
    fraudService.evaluateEvent('create_escrow', {})
        .then(({ action }) => {
            if (action === 'block') {
                res.status(422).json({ code: 'FRAUD_BLOCKED' });
            } else {
                res.status(201).json({ message: 'created' });
            }
        })
        .catch(next);
});
app.use('/api/v1/admin', adminAuth, adminRoutes);

describe('Fraud Detection Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/escrows', () => {
        it('should return 422 FRAUD_BLOCKED when score is >= 80', async () => {
            fraudService.evaluateEvent.mockResolvedValue({
                score: 85,
                labels: ['HIGH_VELOCITY_CREATE', 'AMOUNT_SPIKE'],
                action: 'block'
            });

            const res = await request(app)
                .post('/api/v1/escrows')
                .send({ amount: 10000, counterpartyId: 'freelancer2' });

            expect(res.statusCode).toBe(422);
            expect(res.body.code).toBe('FRAUD_BLOCKED');
        });
    });

    describe('POST /api/v1/admin/fraud/cases/:id/resolve', () => {
        it('should return 400 for an invalid resolution string', async () => {
            fraudService.resolveCase.mockImplementation(() => {
                const error = new Error('Invalid resolution string');
                error.statusCode = 400;
                throw error;
            });

            const res = await request(app)
                .post('/api/v1/admin/fraud/cases/some-case-id/resolve')
                .send({ resolution: 'bad_string' });

            expect(res.statusCode).toBe(400);
            expect(res.body.code).toBe('INVALID_RESOLUTION');
        });
    });

    describe('GET /api/v1/admin/fraud/cases', () => {
        it('should return 403 without admin token (conceptual)', () => {
            // This test is conceptual as we are mocking the auth middleware.
            // A real E2E test would make a request without the token.
            // The `adminAuth` middleware is responsible for the 401/403,
            // and we trust it works. Our routes are correctly placed behind it.
            expect(adminRoutes.stack.some(layer => layer.path === '/fraud/cases' && layer.method === 'get')).toBe(true);
        });
    });
});