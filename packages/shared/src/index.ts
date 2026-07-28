import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const foodeBrand = {
  primary: "#F35050",
  primaryActive: "#E04545",
  primarySoft: "#FFE8E8",
  accent: "#FFB800",
  onPrimary: "#FFFFFF",
  canvas: "#FFFFFF",
  ink: "#222222",
  body: "#3F3F3F",
  muted: "#6A6A6A",
  hairline: "#DDDDDD",
  hairlineSoft: "#EBEBEB",
} as const;
