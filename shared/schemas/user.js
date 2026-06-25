import { z } from 'zod';

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address');

export const userAddressParamSchema = z.object({
  address: stellarAddress,
});

export const importDataSchema = z.object({
  data: z.record(z.unknown()),
  mode: z.enum(['merge', 'replace']),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});
