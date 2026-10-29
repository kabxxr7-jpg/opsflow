import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  SESSION_SECRET: z.string().min(1),
  // Shared secret the n8n workflow (F5) signs its callback requests with. Distinct from
  // WebhookConfig.secret, which is per-outbound-target for deliveries opsflow sends out.
  N8N_CALLBACK_SECRET: z.string().min(1),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SESSION_SECRET: process.env.SESSION_SECRET,
  N8N_CALLBACK_SECRET: process.env.N8N_CALLBACK_SECRET,
});
