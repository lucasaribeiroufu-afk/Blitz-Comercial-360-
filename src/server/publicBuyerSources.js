import robotsParser from "robots-parser";
import { load } from "cheerio";
import { readPublicPage, parsePage, SearchError } from "./verifiedSearch.js";
export function publicRecords(html, url) {
  const $ = load(html, { xmlMode: /^\s*(?:<\?xml|<rss|<feed)/i.test(html) }),
    items = [];
  if ($("item,entry").length) {
    $("item,entry")
      .slice(0, 100)
      .each((_i, item) => {
        const node = $(item);
        const raw = node
          .find("content\\:encoded,content,description,summary")
          .first()
          .text();
        const text = load(raw).text().trim();
        const author = node
          .find("dc\\:creator,author name,author")
          .first()
          .text()
          .trim();
        const link = node.find("link").first();
        let sourceUrl = url;
        try {
          sourceUrl = new URL(link.attr("href") || link.text() || url, url)
            .href;
        } catch {}
        items.push({
          text,
          name: author,
          authorUrl: "",
          sourceUrl: url,
          publicationUrl:
            new URL(sourceUrl).origin === new URL(url).origin ? sourceUrl : url,
          publishedAt: node.find("pubDate,published,updated").first().text(),
          id: node.find("guid,id").first().text(),
          sourceKind: "feed",
        });
      });
    return items;
  }
  for (const r of parsePage(html).records) {
    if (
      !["SocialMediaPosting", "Comment", "DiscussionForumPosting"].includes(
        r["@type"],
      )
    )
      continue;
    const author = r.author;
    if (!author || Array.isArray(author) || typeof author !== "object")
      continue;
    const text = r.text || r.articleBody;
    if (typeof text !== "string") continue;
    let sourceUrl = url;
    try {
      sourceUrl = new URL(r.url || r["@id"] || url, url).href;
    } catch {}
    items.push({
      text,
      name: author.name || "",
      authorUrl: author.url || "",
      sourceUrl: url,
      publicationUrl:
        new URL(sourceUrl).origin === new URL(url).origin ? sourceUrl : url,
      publishedAt: r.datePublished,
      id: r["@id"] || sourceUrl,
      sourceKind: "JSON-LD",
    });
  }
  // Unattributed HTML blocks are observations, never named buyers or personal contacts.
  if (!items.length)
    for (const text of parsePage(html).blocks.slice(0, 100))
      items.push({
        text,
        name: "",
        authorUrl: "",
        sourceUrl: url,
        sourceKind: "HTML sem autor",
      });
  return items;
}
export async function collectPublicUrl(raw, deps = {}) {
  const url = new URL(raw),
    allowed = String(process.env.BLITZ_PUBLIC_ALLOWED_HOSTS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !allowed.includes(url.hostname.toLowerCase())
  )
    throw new SearchError(
      "Fonte não autorizada para leitura pública. Configure BLITZ_PUBLIC_ALLOWED_HOSTS após verificar permissão.",
      400,
    );
  deps.onAttempt?.();
  const deadline = Math.min(deps.deadline || Infinity, Date.now() + 8000);
  const reader =
    deps.readPage ||
    ((u) =>
      readPublicPage(u, 0, deadline, {
        allowText: true,
        allowedHosts: allowed,
      }));
  // The allowlist expresses an explicit site permission, but robots restrictions still take precedence.
  try {
    const robotsUrl = new URL("/robots.txt", url).href;
    const robots = await reader(robotsUrl);
    if (
      robotsParser(robotsUrl, robots.html).isAllowed(
        url.href,
        "Blitz360-EvidenceCollector/1.0",
      ) === false
    )
      throw new SearchError("Leitura bloqueada por robots.txt.", 403);
  } catch (err) {
    if (err.httpStatus !== 404) throw err;
  }
  const page = await reader(url.href);
  if (!allowed.includes(new URL(page.url).hostname))
    throw new SearchError("Redirecionamento para fonte não autorizada.", 400);
  const parsed = load(page.html);
  if (
    parsed("input[type=password]").length ||
    /captcha|verify you are human|login required|sign in to continue/i.test(
      parsed("title").text(),
    )
  )
    throw new SearchError(
      "Página exige login ou CAPTCHA; leitura não realizada.",
      403,
    );
  return { records: publicRecords(page.html, page.url), url: page.url };
}
