import { z } from "zod";
export const browserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goto"), value: z.string() }),
  z.object({
    type: z.enum(["click", "waitForSelector"]),
    selector: z.string().min(1),
  }),
  z.object({
    type: z.enum(["fill", "select", "press"]),
    selector: z.string().min(1),
    value: z.string().default(""),
    secretId: z.string().default(""),
  }),
  z.object({
    type: z.literal("check"),
    selector: z.string().min(1),
    checked: z.boolean().default(true),
  }),
  z.object({ type: z.literal("scroll"), x: z.number(), y: z.number() }),
  z.object({
    type: z.literal("waitForLoad"),
    state: z.enum(["load", "domcontentloaded", "networkidle"]),
  }),
  z.object({ type: z.literal("evaluate"), code: z.string().min(1) }),
]);
export type BrowserAction = z.infer<typeof browserActionSchema>;
