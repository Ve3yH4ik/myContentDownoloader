import type { Boundary } from "./schema";
export function boundaryList(
  nodes: Boundary[],
  depth = 0,
): { boundary: Boundary; depth: number }[] {
  return nodes.flatMap((boundary) => [
    { boundary, depth },
    ...boundaryList(boundary.children, depth + 1),
  ]);
}
export function updateBoundary(
  nodes: Boundary[],
  id: string,
  change: Partial<Boundary>,
): Boundary[] {
  return nodes.map((b) => ({
    ...b,
    ...(b.id === id ? change : {}),
    children:
      change.children && b.id === id
        ? change.children
        : updateBoundary(b.children, id, change),
  }));
}
export function addBoundary(
  nodes: Boundary[],
  repeat: boolean,
  parentId?: string,
): { nodes: Boundary[]; id: string } {
  const ids = new Set(boundaryList(nodes).map((n) => n.boundary.id));
  let number = 1;
  while (ids.has(`boundary_${number}`)) number++;
  const id = `boundary_${number}`;
  const boundary: Boundary = {
    id,
    name: repeat ? "Повторювана границя" : "Нова границя",
    enabled: true,
    mode: "between",
    start: "<h2>",
    end: "</h2>",
    expression: "",
    flags: "g",
    repeat,
    skip: 0,
    reverse: false,
    min: 0,
    max: 10000,
    separator: "\n",
    pipeline: [],
    children: [],
  };
  if (!parentId) return { nodes: [...nodes, boundary], id };
  const parent = boundaryList(nodes).find(
    (n) => n.boundary.id === parentId,
  )?.boundary;
  if (!parent) throw new Error("Батьківську границю не знайдено");
  return {
    nodes: updateBoundary(nodes, parentId, {
      children: [...parent.children, boundary],
    }),
    id,
  };
}
export function removeBoundary(nodes: Boundary[], id: string): Boundary[] {
  return nodes
    .filter((b) => b.id !== id)
    .map((b) => ({ ...b, children: removeBoundary(b.children, id) }));
}
export function focusBoundary(nodes: Boundary[], id: string): Boundary[] {
  for (const b of nodes) {
    if (b.id === id) return [b];
    const children = focusBoundary(b.children, id);
    if (children.length) return [{ ...b, children }];
  }
  return [];
}
