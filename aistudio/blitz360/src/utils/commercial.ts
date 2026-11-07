export const stageLabels: Record<string, string> = {
  new: "Novo",
  contacted: "Contatado",
  meeting: "Reunião",
  qualified: "Qualificado",
  won: "Venda ganha",
  lost: "Venda perdida",
  unreachable: "Sem retorno",
};
export function safeLink(value: unknown) {
  try {
    const u = new URL(typeof value === "string" ? value : "");
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function whatsappLink(value: string, message = "") {
  let p = (value || "").replace(/\D/g, "");
  if (p.length === 10 || p.length === 11) p = `55${p}`;
  return /^55[1-9]\d[2-9]\d{7,8}$/.test(p)
    ? `https://wa.me/${p}?text=${encodeURIComponent(message)}`
    : "";
}
export function evidencedPurchase(c: any) {
  const e = c?.purchaseEvidence;
  return Boolean(
    e?.verified &&
      safeLink(e.url) &&
      e.excerpt?.trim() &&
      Number.isFinite(Date.parse(e.date)) &&
      Date.parse(e.date) <= Date.now(),
  );
}
export interface Pricing {
  cost: number;
  shipping: number;
  insurance: number;
  taxes: number;
  commission: number;
  fees: number;
  margin: number;
  quantity: number;
  mode: "CIF" | "FOB";
}
export function calculatePrice(p: Pricing) {
  const values = [
    p.cost,
    p.shipping,
    p.insurance,
    p.taxes,
    p.commission,
    p.fees,
    p.margin,
    p.quantity,
  ];
  if (
    !values.every(Number.isFinite) ||
    values.some((v) => v < 0) ||
    p.cost <= 0 ||
    !Number.isInteger(p.quantity) ||
    p.quantity <= 0
  )
    throw new Error(
      "Informe custo positivo, quantidade inteira positiva e valores finitos não negativos.",
    );
  const rates = (p.taxes + p.commission + p.fees + p.margin) / 100;
  if (rates >= 1)
    throw new Error(
      "A soma das taxas sobre venda e margem deve ser menor que 100%.",
    );
  const base = p.cost + (p.mode === "CIF" ? p.shipping + p.insurance : 0);
  const unit = Math.ceil((base / (1 - rates)) * 100) / 100;
  const total = Math.round(unit * p.quantity * 100) / 100;
  const contribution =
    (unit * (1 - (p.taxes + p.commission + p.fees) / 100) - base) * p.quantity;
  if (![unit, total, contribution].every(Number.isFinite) || total > 1e12)
    throw new Error("Valores fora da faixa de cálculo.");
  return {
    unit,
    total,
    contribution,
    markup: (unit / base - 1) * 100,
    margin: (contribution / total) * 100,
  };
}
export function externalProposal(name: string, product: string, p: Pricing) {
  if (!product.trim()) throw new Error("Informe o produto da proposta.");
  const v = calculatePrice(p);
  const money = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `PROPOSTA COMERCIAL — RASCUNHO\n\nOlá, ${name}.\nProduto: ${product.trim()}\nQuantidade: ${p.quantity} unidades\nModalidade: ${p.mode}${p.mode === "CIF" ? " — frete incluído conforme destino a confirmar" : " — frete a combinar por conta do comprador"}\nPreço unitário: ${money(v.unit)}\nTotal: ${money(v.total)}\n\nPagamento, prazo, disponibilidade, documentação e validade: sujeitos à confirmação antes do pedido.`;
}
