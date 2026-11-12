import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { locateSource, sourceElementAt } from "../src/core/source-inspector";
import {
  addBoundary,
  updateBoundary,
  removeBoundary,
  focusBoundary,
  boundaryList,
} from "../src/core/boundary-tree";
import { projectSchema } from "../src/core/schema";
import { parseDocument } from "../src/core/engine";
import example from "../examples/products.json";
describe("source inspector", () => {
  it("locates the exact repeated element rather than the first identical markup", () => {
    const html = "<html><body><p>Same</p><p>Same</p></body></html>";
    const selected = locateSource(html, "p:nth-of-type(2)");
    expect(selected.start).toBe(html.lastIndexOf("<p>"));
    expect(selected.outerHTML).toBe("<p>Same</p>");
    expect(selected.opening).toBe("<p>");
    expect(selected.closing).toBe("</p>");
  });
  it("maps UTF-16 positions to the deepest element and its parent opening tag", () => {
    const html = '<article id="parent"><h2 id="name">Назва 🌿</h2></article>';
    expect(sourceElementAt(html, html.indexOf("Назва")).selector).toBe("#name");
    expect(sourceElementAt(html, html.indexOf("article") + 1).selector).toBe(
      "#parent",
    );
  });
  it("ignores lookalike tags inside scripts/comments and escapes IDs", () => {
    const html =
      '<html><body><!-- <p id="9:target">hidden</p> --><p id="9:target">Actual</p><script>const x="<p>fake</p>";</script></body></html>';
    const selected = sourceElementAt(html, html.indexOf("Actual"));
    expect(selected.outerHTML).toBe('<p id="9:target">Actual</p>');
    expect(selected.start).toBe(html.indexOf('<p id="9:target">Actual'));
  });
  it("handles void elements and rejects absent elements or invalid offsets", () => {
    expect(locateSource('<img src="x">', "img").closing).toBe("");
    expect(() => locateSource("<p>ok</p>", ".missing")).toThrow();
    expect(() => sourceElementAt("<p>ok</p>", -1)).toThrow();
  });
});
describe("boundary tree editing and focused preview", () => {
  it("adds ordinary/repeated/nested nodes with unique IDs and preserves unrelated nodes", () => {
    const original = projectSchema.parse(example).boundaries;
    const first = addBoundary(original, false, "products");
    const second = addBoundary(first.nodes, true, first.id);
    expect(second.id).not.toBe(first.id);
    expect(
      boundaryList(second.nodes).find((b) => b.boundary.id === second.id)
        ?.depth,
    ).toBe(2);
    const updated = updateBoundary(second.nodes, second.id, {
      name: "Nested repeat",
      skip: 1,
    });
    expect(original[0].name).toBe(updated[0].name);
    expect(
      boundaryList(updated).find((b) => b.boundary.id === second.id)?.boundary
        .name,
    ).toBe("Nested repeat");
    expect(
      boundaryList(removeBoundary(updated, first.id)).some(
        (b) => b.boundary.id === second.id,
      ),
    ).toBe(false);
  });
  it("previews a nested boundary in its repeated parent context without unrelated siblings", () => {
    const project = projectSchema.parse(example);
    const html = readFileSync(
      new URL("../examples/catalog.html", import.meta.url),
      "utf8",
    );
    project.boundaries = focusBoundary(project.boundaries, "price");
    const result = parseDocument(project, html);
    expect(result.rows.map((r) => r.price)).toEqual(["120.50", "980"]);
    expect(result.rows[0].name).toBeUndefined();
    expect(result.boundaries[0].id).toBe("products");
  });
});
