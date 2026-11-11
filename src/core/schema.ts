import { z } from "zod";

export const operationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("replace"),
      find: z.string().min(1),
      replacement: z.string(),
      regex: z.boolean().default(false),
      flags: z.string().default("g"),
    })
    .strict(),
  z
    .object({
      type: z.enum(["prepend", "append", "fallback", "trimEndCharacters"]),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.enum([
        "trimWhitespace",
        "htmlToText",
        "lowercase",
        "singleLine",
        "required",
      ]),
    })
    .strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
export interface Boundary {
  id: string;
  name: string;
  enabled: boolean;
  mode: "between" | "regex" | "css";
  start: string;
  end: string;
  expression: string;
  flags: string;
  repeat: boolean;
  skip: number;
  reverse: boolean;
  min: number;
  max: number;
  separator: string;
  pipeline: Operation[];
  children: Boundary[];
}
export const boundarySchema: z.ZodType<Boundary> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      name: z.string().min(1),
      enabled: z.boolean().default(true),
      mode: z.enum(["between", "regex", "css"]),
      start: z.string().default(""),
      end: z.string().default(""),
      expression: z.string().default(""),
      flags: z.string().default("g"),
      repeat: z.boolean().default(false),
      skip: z.number().int().min(0).default(0),
      reverse: z.boolean().default(false),
      min: z.number().int().min(0).default(0),
      max: z.number().int().min(1).max(100000).default(10000),
      separator: z.string().default("\n"),
      pipeline: z.array(operationSchema).default([]),
      children: z.array(boundarySchema).default([]),
    })
    .strict()
    .superRefine((b, ctx) => {
      if (b.min > b.max)
        ctx.addIssue({ code: "custom", message: "min must be <= max" });
      if (b.mode === "between" && (!b.start || !b.end))
        ctx.addIssue({
          code: "custom",
          message: "between requires nonempty start and end",
        });
      if (b.mode !== "between" && !b.expression)
        ctx.addIssue({ code: "custom", message: "expression is required" });
    }),
);
export const projectSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(200),
    url: z
      .url()
      .refine(
        (v) => ["http:", "https:"].includes(new URL(v).protocol),
        "Only HTTP(S) URLs",
      ),
    timeoutMs: z.number().int().min(100).max(120000).default(30000),
    boundaries: z.array(boundarySchema).min(1),
    template: z.string().default("[VALUE]"),
    urlQueue: z
      .array(
        z
          .url()
          .refine((v) => ["http:", "https:"].includes(new URL(v).protocol)),
      )
      .max(10000)
      .default([]),
    scannerUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .refine((v) => ["http:", "https:"].includes(new URL(v).protocol)),
      ])
      .default(""),
    scannerSameOrigin: z.boolean().default(true),
    generator: z
      .object({
        pattern: z.string(),
        from: z.number().int(),
        to: z.number().int(),
        step: z.number().int().min(1),
      })
      .strict()
      .default({
        pattern: "https://example.com/page/{num}",
        from: 1,
        to: 10,
        step: 1,
      }),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    const visit = (nodes: Boundary[]) =>
      nodes.forEach((b) => {
        if (ids.has(b.id))
          ctx.addIssue({
            code: "custom",
            message: `Duplicate boundary ID: ${b.id}`,
          });
        ids.add(b.id);
        visit(b.children);
      });
    visit(p.boundaries);
  });
export type Project = z.infer<typeof projectSchema>;
