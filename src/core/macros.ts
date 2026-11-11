export const macroRegistry = [
  {
    name: "VALUE",
    syntax: "[VALUE]",
    description: "Current boundary value",
    default: "",
    example: "Value: [VALUE]",
  },
  {
    name: "COUNT",
    syntax: "[COUNT]",
    description: "Number of current values",
    default: "0",
    example: "[COUNT] items",
  },
  {
    name: "INDEX_ID",
    syntax: "[INDEX_ID]",
    description: "One-based index",
    default: "1",
    example: "[INDEX_ID]: [VALUE]",
  },
  {
    name: "BOUNDARY",
    syntax: "[BOUNDARY:id]",
    description: "Joined values of a root boundary",
    default: "",
    example: "[BOUNDARY:title]",
  },
] as const;
export function renderTemplate(
  template: string,
  context: {
    value: string;
    count: number;
    index: number;
    boundaries: Record<string, string>;
  },
): string {
  return template.replace(/\[([^\]]+)\]/g, (_, token: string) => {
    if (token === "VALUE") return context.value;
    if (token === "COUNT") return String(context.count);
    if (token === "INDEX_ID") return String(context.index);
    if (token.startsWith("BOUNDARY:")) {
      const id = token.slice(9);
      if (!Object.hasOwn(context.boundaries, id))
        throw new Error(`Unknown boundary: ${id}`);
      return context.boundaries[id];
    }
    throw new Error(`Unsupported macro syntax: [${token}]`);
  });
}
