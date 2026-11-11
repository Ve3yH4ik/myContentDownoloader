import { load } from "cheerio";
import { projectSchema, type Boundary, type Operation } from "./schema";
import { renderTemplate } from "./macros";

export interface Trace {
  boundary: string;
  operation: string;
  before: string;
  after: string;
  durationMs: number;
}
export interface BoundaryResult {
  id: string;
  values: { value: string; children: BoundaryResult[] }[];
  joined: string;
}
export interface RunResult {
  url: string;
  document: string;
  boundaries: BoundaryResult[];
  rows: Record<string, string>[];
  json: string;
  csv: string;
  output: string;
  trace: Trace[];
  log: string[];
}

export function applyPipeline(
  value: string,
  pipeline: Operation[],
  boundary: string,
  trace: Trace[],
): string {
  for (const op of pipeline) {
    const before = value;
    const start = performance.now();
    switch (op.type) {
      case "replace":
        value = op.regex
          ? value.replace(new RegExp(op.find, op.flags), op.replacement)
          : value.split(op.find).join(op.replacement);
        break;
      case "prepend":
        value = op.value + value;
        break;
      case "append":
        value += op.value;
        break;
      case "fallback":
        if (!value) value = op.value;
        break;
      case "trimEndCharacters":
        while (value && op.value.includes(value.at(-1)!))
          value = value.slice(0, -1);
        break;
      case "trimWhitespace":
        value = value.trim();
        break;
      case "htmlToText":
        value = load(value).text();
        break;
      case "lowercase":
        value = value.toLowerCase();
        break;
      case "singleLine":
        value = value.replace(/\s+/g, " ");
        break;
      case "required":
        if (!value) throw new Error(`${boundary}: required value is empty`);
        break;
    }
    trace.push({
      boundary,
      operation: op.type,
      before,
      after: value,
      durationMs: performance.now() - start,
    });
  }
  return value;
}
function extract(source: string, b: Boundary): string[] {
  const values: string[] = [];
  if (b.mode === "between") {
    let pos = 0;
    while (pos < source.length) {
      const start = source.indexOf(b.start, pos);
      if (start < 0) break;
      const end = source.indexOf(b.end, start + b.start.length);
      if (end < 0) break;
      values.push(source.slice(start + b.start.length, end));
      pos = end + b.end.length;
    }
  } else if (b.mode === "regex") {
    const regex = new RegExp(
      b.expression,
      b.flags.includes("g") ? b.flags : b.flags + "g",
    );
    for (const match of source.matchAll(regex))
      values.push(match[1] ?? match[0]);
  } else {
    const $ = load(source);
    $(b.expression).each((_, el) => {
      values.push($(el).html() ?? "");
    });
  }
  if (b.reverse) values.reverse();
  return values.slice(b.skip, b.skip + (b.repeat ? b.max : 1));
}
function evaluate(source: string, b: Boundary, trace: Trace[]): BoundaryResult {
  const start = performance.now();
  const extracted = extract(source, b);
  // Run fallback/required once on an empty value when no match exists.
  if (
    !extracted.length &&
    b.pipeline.some((p) => p.type === "fallback" || p.type === "required")
  )
    extracted.push("");
  if (extracted.length < b.min)
    throw new Error(
      `${b.id}: expected at least ${b.min} results, got ${extracted.length}`,
    );
  const values = extracted.map((raw) => {
    trace.push({
      boundary: b.id,
      operation: "extract",
      before: source,
      after: raw,
      durationMs: performance.now() - start,
    });
    const value = applyPipeline(raw, b.pipeline, b.id, trace);
    const children = b.children
      .filter((c) => c.enabled)
      .map((c) => evaluate(value, c, trace));
    return { value, children };
  });
  return {
    id: b.id,
    values,
    joined: values.map((v) => v.value).join(b.separator),
  };
}
function flatten(result: BoundaryResult): Record<string, string>[] {
  return result.values.flatMap((v) => {
    let rows: Record<string, string>[] = [{ [result.id]: v.value }];
    for (const child of v.children) {
      const childRows = flatten(child);
      rows = rows.flatMap((row) =>
        (childRows.length ? childRows : [{}]).map((c) => ({ ...row, ...c })),
      );
    }
    return rows;
  });
}
export function toCsv(rows: Record<string, string>[]): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  return [keys, ...rows.map((row) => keys.map((k) => row[k] ?? ""))]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}
export function parseDocument(input: unknown, document: string): RunResult {
  const project = projectSchema.parse(input);
  const trace: Trace[] = [];
  const boundaries = project.boundaries
    .filter((b) => b.enabled)
    .map((b) => evaluate(document, b, trace));
  // Repeating roots create separate datasets; scalar roots are shared columns.
  const repeatingIds = new Set(
    project.boundaries.filter((b) => b.repeat).map((b) => b.id),
  );
  let baseRows: Record<string, string>[] = [{}];
  for (const scalar of boundaries.filter((b) => !repeatingIds.has(b.id))) {
    const scalarRows = flatten(scalar);
    baseRows = baseRows.flatMap((base) =>
      (scalarRows.length ? scalarRows : [{ [scalar.id]: "" }]).map((row) => ({
        ...base,
        ...row,
      })),
    );
  }
  const groups = boundaries.filter((b) => repeatingIds.has(b.id));
  const rows = groups.length
    ? groups.flatMap((b) =>
        baseRows.flatMap((base) =>
          flatten(b).map((row) => ({ ...base, ...row })),
        ),
      )
    : baseRows;
  const joined = Object.fromEntries(boundaries.map((b) => [b.id, b.joined]));
  const output = rows
    .map((row, index) =>
      renderTemplate(project.template, {
        value: JSON.stringify(row),
        count: rows.length,
        index: index + 1,
        boundaries: joined,
      }),
    )
    .join("\n");
  return {
    url: project.url,
    document,
    boundaries,
    rows,
    json: JSON.stringify(rows, null, 2),
    csv: toCsv(rows),
    output,
    trace,
    log: [
      `Parsed ${boundaries.length} boundaries; ${rows.length} output rows`,
      `${trace.length} trace events`,
    ],
  };
}
export async function fetchDocument(
  project: { url: string; timeoutMs: number },
  signal?: AbortSignal,
): Promise<{ document: string; status: number; size: number }> {
  if (!["http:", "https:"].includes(new URL(project.url).protocol))
    throw new Error("Only HTTP(S) URLs");
  const response = await fetch(project.url, {
    signal: AbortSignal.any([
      AbortSignal.timeout(project.timeoutMs),
      ...(signal ? [signal] : []),
    ]),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty HTTP body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Document exceeds 5 MiB limit");
    }
    chunks.push(value);
  }
  return {
    document: new TextDecoder().decode(Buffer.concat(chunks)),
    status: response.status,
    size,
  };
}
export async function runProject(
  input: unknown,
  signal?: AbortSignal,
): Promise<RunResult> {
  const project = projectSchema.parse(input);
  const { document, status, size } = await fetchDocument(project, signal);
  const result = parseDocument(project, document);
  result.log.unshift(`HTTP ${status}; ${size} bytes`);
  return result;
}
