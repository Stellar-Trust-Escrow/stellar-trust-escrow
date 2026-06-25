import { z } from 'zod';

export const nonceSchema = z.object({
  address: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
});

export const verifySchema = z.object({
  address: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
  nonce: z.string().min(1, 'Nonce is required'),
  signature: z.string().min(1, 'Signature is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
