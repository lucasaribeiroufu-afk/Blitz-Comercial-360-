import {
  professionalContacts,
  structuralPhone,
} from "./professionalContacts.js";
import { load } from "cheerio";
import { readPublicPage, normalize } from "./verifiedSearch.js";
const sameSite = (a, b) =>
  new URL(a).hostname.replace(/^www\./, "") ===
  new URL(b).hostname.replace(/^www\./, "");
export function publishedBusinessContacts(
  html,
  sourceUrl,
  retrievedAt = new Date().toISOString(),
) {
  const $ = load(html);
  $('script,style,noscript,[hidden],[aria-hidden="true"]').remove();
  const contacts = {};
  $("a[href]").each((_i, element) => {
    const href = $(element).attr("href") || "",
      label = $(element).text().replace(/\s+/g, " ").trim();
    let field, value;
    if (href.toLowerCase().startsWith("mailto:")) {
      field = "email";
      try {
        value = decodeURIComponent(href.slice(7).split("?")[0]).trim();
      } catch {
        return;
      }
      if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return;
    }
    if (href.toLowerCase().startsWith("tel:")) {
      field = "phone";
      value = href.slice(4).trim();
      let d = value.replace(/\D/g, "");
      if (d.startsWith("55") && d.length > 11) d = d.slice(2);
      if (!/^[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(d)) return;
    }
    if (field && !contacts[field])
      contacts[field] = {
        value,
        sourceUrl,
        source: "Contato comercial publicado no site vinculado à empresa",
        retrievedAt,
        excerpt: `${label} — ${href}`,
      };
  });
  return contacts;
}
export async function enrichBusinessContacts(lead, deps = {}) {
  if (!lead.website) return lead;
  const start = lead.website.replace(/^http:\/\//, "https://"),
    reader = deps.readPage || readPublicPage;
  try {
    const page = await reader(start);
    if (!sameSite(page.url, start)) return lead;
    const $ = load(page.html),
      company = normalize(lead.name);
    const heading = normalize($("title").text() + " " + $("h1").first().text());
    // The site itself must name the business from the Places result, avoiding directories/brand collisions.
    if (company.length < 4 || !heading.includes(company)) return lead;
    const links = [
      ...new Set(
        $("a[href]")
          .map((_i, element) => {
            const href = $(element).attr("href") || "";
            try {
              const u = new URL(href, page.url);
              return u.protocol === "https:" &&
                sameSite(u.href, page.url) &&
                /contato|contact|fale-conosco|atendimento|equipe|team|sobre|about|compras/i.test(
                  u.pathname,
                )
                ? u.href
                : "";
            } catch {
              return "";
            }
          })
          .get()
          .filter(Boolean),
      ),
    ].slice(0, 2);
    const evidence = publishedBusinessContacts(page.html, page.url);
    const professionals = professionalContacts(page.html, page.url, lead.name);
    const extra = await Promise.all(
      links.map(async (url) => {
        try {
          const p = await reader(url);
          if (!sameSite(p.url, page.url)) return {};
          professionals.push(...professionalContacts(p.html, p.url, lead.name));
          return publishedBusinessContacts(p.html, p.url);
        } catch {
          return {};
        }
      }),
    );
    for (const fields of extra)
      for (const [field, e] of Object.entries(fields))
        if (!evidence[field]) evidence[field] = e;
    const next = {
      ...lead,
      evidence: { ...lead.evidence },
      professionalContacts: [
        ...new Map(
          professionals.map((p) => [p.name + ":" + p.role, p]),
        ).values(),
      ],
      companyContactLabel: "Contato da empresa",
      corporateOfficers: lead.socios || [],
    };
    for (const [field, e] of Object.entries(evidence))
      if (!next[field]) {
        next[field] = e.value;
        next.evidence[field] = e;
      }
    if (!next.establishmentPhone && next.phone) {
      next.establishmentPhone = next.phone;
      next.evidence.establishmentPhone = next.evidence.phone;
    }
    const buyers = next.professionalContacts.filter(p => /compr|supriment|procurement|purchas/i.test(p.role));
    if (buyers.length === 1) {
      const person = buyers[0];
      next.decisionMaker = person.name;
      next.department = person.role;
      next.evidence.decisionMaker = person.evidence.name;
      next.evidence.department = person.evidence.role;
      if (person.phone) {
        next.decisionMakerPhone = person.phone;
        next.evidence.decisionMakerPhone = person.evidence.phone;
      }
    }
    next.phoneStructure = structuralPhone(next.phone);
    return next;
  } catch {
    return lead;
  }
}
