import { z } from 'zod';

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address');

export const broadcastEscrowSchema = z.object({
  signedXdr: z
    .string()
    .min(1, 'signedXdr is required')
    .max(100_000, 'signedXdr must be under 100,000 characters'),
});

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

export const escrowIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Escrow id must be a numeric string'),
});

export const milestoneIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Escrow id must be a numeric string'),
  milestoneId: z.string().regex(/^\d+$/, 'Milestone id must be a numeric string'),
});

export const createMilestoneSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  amount: z.number().positive(),
  dueDate: z.string().datetime().optional(),
});
