import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  APP_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  NEXT_PUBLIC_DEMO_HINT: z.string().optional(),
  // Shared secret the n8n workflow (F5) signs its callback requests with. Distinct from
  // WebhookConfig.secret, which is per-outbound-target for deliveries opsflow sends out.
  N8N_CALLBACK_SECRET: z.string().min(1),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  APP_PASSWORD: process.env.APP_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NEXT_PUBLIC_DEMO_HINT: process.env.NEXT_PUBLIC_DEMO_HINT,
  N8N_CALLBACK_SECRET: process.env.N8N_CALLBACK_SECRET,
});
