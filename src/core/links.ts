import { load } from "cheerio";
export function extractLinks(
  document: string,
  source: string,
  sameOrigin: boolean,
): string[] {
  const base = new URL(source);
  const links = new Set<string>();
  const xml = /<(?:sitemapindex|urlset)(?:\s|>)/i.test(document);
  const $ = load(document, { xmlMode: xml });
  const htmlBase = !xml ? $("base[href]").first().attr("href") : undefined;
  let resolvedBase = base;
  try {
    if (htmlBase) resolvedBase = new URL(htmlBase, base);
  } catch {
    /* Ignore invalid base. */
  }
  $(xml ? "loc" : "a[href]").each((_, element) => {
    const value = xml ? $(element).text().trim() : $(element).attr("href");
    if (!value) return;
    try {
      const url = new URL(value, resolvedBase);
      url.hash = "";
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return;
      if (sameOrigin && url.origin !== base.origin) return;
      links.add(url.href);
    } catch {
      /* Invalid href is not a downloadable URL. */
    }
  });
  if (links.size > 10000) throw new Error("Scanner limit: 10000 links");
  return [...links];
}
