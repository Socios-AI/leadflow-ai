// src/lib/validators/ai-config.ts
import { z } from "zod";

export const aiConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic"]).default("openai"),
  model: z
    .enum(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"])
    .default("gpt-4o"),
  systemPrompt: z
    .string()
    .min(50, "System prompt must be at least 50 characters")
    .max(50000, "System prompt is too long"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).default(1000),
  persona: z
    .object({
      name: z.string().max(100).optional(),
      role: z.string().max(100).optional(),
      tone: z.string().max(100).optional(),
      language: z.string().max(10).optional(),
      greeting: z.string().max(500).optional(),
    })
    .optional()
    .nullable(),
  rules: z
    .array(
      z.object({
        rule: z.string().min(1).max(500),
        priority: z.enum(["low", "medium", "high"]),
      })
    )
    .max(50)
    .optional()
    .nullable(),
  businessHours: z
    .object({
      timezone: z.string(),
      schedule: z.record(
        z.string(),
        z.object({
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
          enabled: z.boolean(),
        })
      ),
    })
    .optional()
    .nullable(),
  offHoursMessage: z.string().max(1000).optional().nullable(),
  escalationConfig: z
    .object({
      triggers: z.array(z.string().max(200)).max(20),
      notifyPhone: z.string().max(20).optional(),
      notifyEmail: z.string().email().optional(),
    })
    .optional()
    .nullable(),
  conversionConfig: z
    .object({
      triggers: z.array(z.string().max(200)).max(20),
      action: z.enum(["notify", "redirect"]),
      redirectUrl: z.string().url().optional(),
      notifyPhone: z.string().max(20).optional(),
      notifyEmail: z.string().email().optional(),
    })
    .optional()
    .nullable(),
});

export type AIConfigInput = z.infer<typeof aiConfigSchema>;