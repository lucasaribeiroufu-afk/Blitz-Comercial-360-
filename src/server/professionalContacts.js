import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { parsePage, normalize } from "./verifiedSearch.js";
export function structuralPhone(raw) {
  const phone = parsePhoneNumberFromString(String(raw || ""), "BR");
  return {
    raw: String(raw || ""),
    e164: phone?.number || "",
    structurallyValid: !!phone?.isValid(),
    activity: "not_tested",
    whatsapp: "not_confirmed",
    ownership: "not_verified",
  };
}
export function professionalContacts(
  html,
  sourceUrl,
  company,
  retrievedAt = new Date().toISOString(),
) {
  const records = parsePage(html).records,
    people = [];
  for (const r of records) {
    const type = [r["@type"]].flat();
    if (
      type.includes("Organization") &&
      normalize(r.name) === normalize(company)
    )
      for (const person of [r.employee || []].flat())
        if (typeof person === "object")
          people.push({ ...person, explicitEmployer: company });
    if (
      type.includes("Person") &&
      [r.worksFor || []]
        .flat()
        .some(
          (org) =>
            typeof org === "object" &&
            normalize(org.name) === normalize(company),
        )
    )
      people.push({ ...r, explicitEmployer: company });
  }
  const seen = new Set(),
    out = [];
  for (const p of people) {
    if (
      typeof p.name !== "string" ||
      typeof p.jobTitle !== "string" ||
      !/compr|comercial|sales|vendas|gerente|diretor|administrador/i.test(
        p.jobTitle,
      )
    )
      continue;
    const key = p.name + ":" + p.jobTitle;
    if (seen.has(key)) continue;
    seen.add(key);
    const evidence = {};
    const fields = { name: p.name, role: p.jobTitle, company };
    for (const [field, value] of Object.entries(fields))
      evidence[field] = {
        value,
        sourceUrl,
        source: "Vínculo profissional declarado em JSON-LD da fonte comercial",
        retrievedAt,
        excerpt: JSON.stringify(p).slice(0, 6000),
      };
    const phone = typeof p.telephone === "string" ? p.telephone : "",
      email =
        typeof p.email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)
          ? p.email
          : "";
    for (const [field, value] of Object.entries({ phone, email }))
      if (value)
        evidence[field] = {
          value,
          sourceUrl,
          source:
            "Contato explicitamente declarado no mesmo registro profissional",
          retrievedAt,
          excerpt: JSON.stringify(p).slice(0, 6000),
        };
    out.push({
      name: p.name,
      role: p.jobTitle,
      company,
      phone,
      email,
      phoneStructure: structuralPhone(phone),
      evidence,
      fieldStatus: {
        name: "source_observed",
        role: "source_observed",
        company: "source_observed",
        phone: phone ? "source_observed_not_active_tested" : "not_published",
        email: email ? "source_observed" : "not_published",
      },
      buyerAuthority: "not_confirmed",
    });
  }
  return out;
}
