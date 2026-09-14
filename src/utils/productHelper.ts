export interface ParsedProductInsight {
  raw: string;
  productName: string;
  destinationSite?: string;
}

/**
 * Parses a trending insight string into a structured product name and destination website.
 * Examples:
 * "Micro-ondas Electrolux 31L MI42S → Redirecionado para: Mercado Livre (mercadolivre.com.br)"
 * "Fogão 4 Bocas Dako Supreme -> Magazine Luiza (magazineluiza.com.br)"
 * "Clarificante de Caldo -> Nalco Water"
 */
export function parseProductInsight(insight: string): ParsedProductInsight {
  if (!insight) {
    return { raw: '', productName: '' };
  }

  const raw = insight.trim();

  // Look for arrows or redirection markers: "→ Redirecionado para:", "->", "→ Destino:", "Redirecionado para:"
  const arrowMatch = raw.match(/^(.*?)(?:\s*(?:→|->)\s*(?:Redirecionado para:|Destino:|Cotação direcionada para:|Direcionado para:)?\s*|\s+(?:Redirecionado para:|Destino:)\s+)(.+)$/i);

  if (arrowMatch && arrowMatch[1] && arrowMatch[2]) {
    return {
      raw,
      productName: arrowMatch[1].trim(),
      destinationSite: arrowMatch[2].trim(),
    };
  }

  // Look for parenthetical destination e.g. "Micro-ondas 30L (via Mercado Livre)"
  const parenMatch = raw.match(/^(.*?)\s*\((?:via|em|site|loja:?)\s*([^)]+)\)$/i);
  if (parenMatch && parenMatch[1] && parenMatch[2]) {
    return {
      raw,
      productName: parenMatch[1].trim(),
      destinationSite: parenMatch[2].trim(),
    };
  }

  return {
    raw,
    productName: raw,
  };
}

/**
 * Checks whether a competitor price string contains explicit shipping information
 */
export function hasShippingIncluded(priceStr?: string): boolean {
  if (!priceStr) return false;
  const norm = priceStr.toLowerCase();
  return (
    norm.includes('frete incluso') ||
    norm.includes('frete grátis') ||
    norm.includes('c/ frete') ||
    norm.includes('com frete') ||
    norm.includes('cif') ||
    norm.includes('+ frete')
  );
}
