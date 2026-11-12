import { load } from "cheerio";
interface Location {
  startOffset: number;
  endOffset: number;
  startTag?: { startOffset: number; endOffset: number };
  endTag?: { startOffset: number; endOffset: number };
}
export interface SourceSelection {
  selector: string;
  start: number;
  end: number;
  opening: string;
  closing: string;
  outerHTML: string;
}
export function locateSource(html: string, selector: string): SourceSelection {
  const $ = load(html, { sourceCodeLocationInfo: true });
  const node = $(selector).first().get(0);
  const location = (
    node as unknown as { sourceCodeLocation?: Location } | undefined
  )?.sourceCodeLocation;
  if (!location)
    throw new Error("Елемент не знайдено у поточному HTML. Оновіть сторінку.");
  return {
    selector,
    start: location.startOffset,
    end: location.endOffset,
    opening: location.startTag
      ? html.slice(location.startTag.startOffset, location.startTag.endOffset)
      : "",
    closing: location.endTag
      ? html.slice(location.endTag.startOffset, location.endTag.endOffset)
      : "",
    outerHTML: html.slice(location.startOffset, location.endOffset),
  };
}
function identifier(value: string) {
  return (
    "#" +
    Array.from(value)
      .map((c, index) =>
        value === "-"
          ? "\\-"
          : /[a-zA-Z0-9_-]/.test(c) &&
              !(index === 0 && /[0-9]/.test(c)) &&
              !(index === 1 && value[0] === "-" && /[0-9]/.test(c))
            ? c
            : `\\${c.codePointAt(0)!.toString(16)} `,
      )
      .join("")
  );
}
export function sourceElementAt(html: string, offset: number): SourceSelection {
  if (!Number.isInteger(offset) || offset < 0 || offset > html.length)
    throw new Error("Некоректна позиція у коді");
  const $ = load(html, { sourceCodeLocationInfo: true });
  const nodes = $("*")
    .toArray()
    .map((node) => ({
      node,
      location: (node as unknown as { sourceCodeLocation?: Location })
        .sourceCodeLocation,
    }))
    .filter(
      (v) =>
        v.location &&
        v.location.startOffset <= offset &&
        v.location.endOffset > offset,
    )
    .sort(
      (a, b) =>
        a.location!.endOffset -
        a.location!.startOffset -
        (b.location!.endOffset - b.location!.startOffset),
    );
  const chosen = nodes[0]?.node;
  if (!chosen) throw new Error("У цій позиції немає HTML-елемента");
  const id = $(chosen).attr("id");
  let selector = "";
  if (
    id &&
    $("[id]")
      .toArray()
      .filter((n) => $(n).attr("id") === id).length === 1
  )
    selector = identifier(id);
  else {
    const parts: string[] = [];
    let element = chosen;
    while (element && element.type !== "root") {
      if (!("tagName" in element)) break;
      const tag = element.tagName;
      if (!tag) break;
      const index = $(element).prevAll(tag).length + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      const parent = $(element).parent().get(0);
      if (!parent) break;
      element = parent;
    }
    selector = parts.join(" > ");
  }
  return locateSource(html, selector);
}
