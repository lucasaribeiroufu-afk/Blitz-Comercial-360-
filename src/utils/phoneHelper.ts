import {apiHeaders} from '../services/apiAuth';
import { validateBrazilianPhone } from './contactVeracityAuditor';
import type { Contact } from '../types';

/**
 * Extracts digits only from a phone string.
 */
export function extractDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Extracts the 2-digit Brazilian DDD (Area Code) from a phone string or location.
 */
export function extractDDD(phone?: string, location?: string): string {
  if (phone) {
    const digits = extractDigits(phone);
    if (digits.startsWith('55') && digits.length >= 4) {
      return digits.slice(2, 4);
    }
    if (digits.length >= 2) {
      const match = phone.match(/\((\d{2})\)/);
      if (match) return match[1];
      if (digits.length === 10 || digits.length === 11) {
        return digits.slice(0, 2);
      }
    }
  }

  if (location) {
    const locLower = location.toLowerCase();
    if (locLower.includes('uberlandia') || locLower.includes('uberlândia') || 
        locLower.includes('uberaba') || locLower.includes('araxa') || 
        locLower.includes('araxá') || locLower.includes('ituiutaba') ||
        locLower.includes('patos de minas') || locLower.includes('campo florido') ||
        locLower.includes('conceicao das alagoas') || locLower.includes('conceição das alagoas')) {
      return '34';
    }
    if (locLower.includes('ribeirao preto') || locLower.includes('ribeirão preto') || 
        locLower.includes('franca') || locLower.includes('buritizal') || 
        locLower.includes('sertaozinho') || locLower.includes('sertãozinho') || 
        locLower.includes('batatais') || locLower.includes('barretos')) {
      return '16';
    }
    if (locLower.includes('belo horizonte') || locLower.includes('betim') || locLower.includes('contagem')) {
      return '31';
    }
    if (locLower.includes('sao paulo') || locLower.includes('são paulo') || locLower.includes('guarulhos') || locLower.includes('campinas')) {
      return locLower.includes('campinas') ? '19' : '11';
    }
    if (locLower.includes('goiania') || locLower.includes('goiânia') || locLower.includes('rio verde') || locLower.includes('jatai') || locLower.includes('jataí')) {
      return '62';
    }
  }

  return '34'; // Default to Triângulo Mineiro DDD
}

/**
 * Checks if a Brazilian telephone number is a landline (fixo).
 * Brazilian landlines have 8 digits and start with 2, 3, 4, or 5.
 */
export function isLandline(phone?: string): boolean {
  if (!phone) return false;
  let digits = extractDigits(phone);
  if (digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  // Now digits is [DDD] + [number]
  if (digits.length >= 10) {
    const localNumber = digits.slice(2);
    // 8 digits and starts with 2, 3, 4, or 5
    if (localNumber.length === 8 && /^[2-5]/.test(localNumber)) {
      return true;
    }
  } else if (digits.length === 8 && /^[2-5]/.test(digits)) {
    return true;
  }
  return false;
}

/**
 * Checks if a Brazilian telephone number is a mobile phone (celular com 9 dígitos).
 * Brazilian mobile numbers have 9 digits and start with 9.
 */
export function isMobile(phone?: string): boolean {
  if (!phone) return false;
  let digits = extractDigits(phone);
  if (digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.length >= 10) {
    const localNumber = digits.slice(2);
    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      return true;
    }
  } else if (digits.length === 9 && digits.startsWith('9')) {
    return true;
  }
  return false;
}

/**
 * Formats a Brazilian telephone number for clean display:
 * - Mobile: +55 (DD) 9XXXX-XXXX
 * - Landline: +55 (DD) XXXX-XXXX
 */
export function formatBrazilianPhone(phone?: string, dddFallback: string = '34'): string {
  if (!phone) return '';
  let digits = extractDigits(phone);
  if (digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  let ddd = dddFallback;
  let local = digits;
  if (digits.length >= 10) {
    ddd = digits.slice(0, 2);
    local = digits.slice(2);
  }

  if (local.length === 9) {
    return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
  }
  if (local.length === 8) {
    return `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }
  return phone;
}

/**
 * Deterministically generates a consistent, valid 9-digit Brazilian mobile
 * WhatsApp number for a decision maker based on the company name/seed and DDD.
 */
export interface DeepSearchLinks {
  cartorio: string;
  diarioOficial: string;
  licitacoes: string;
  vagasEmprego: string;
  redesSociais: string;
  notaFiscalSintegra: string;
  googleBuscaGeral: string;
}

export interface ResolvedWhatsApp {
  displayPhone: string;
  cleanPhone: string; // Ready for wa.me/
  isMobile: boolean;
  establishmentPhone: string;
  decisionMakerRole: string;
  isVerifiedReal: boolean;
  callUrl: string; // tel: link for instant phone call / PABX
  searchUrl: string; // Google Search URL for instant verification
  legalSource?: string;
  sourcesChecked?: string[];
  sourcesFound?: string[];
  deepSearchLinks: DeepSearchLinks;
}

/**
 * Builds direct search queries for the 6 primary public consultation sources:
 * - Cartório & Contrato Social
 * - Diários Oficiais (DOU, DOE, DOM)
 * - Licitações Públicas (PNCP, Comprasnet)
 * - Vagas e Emprego (Catho, Vagas, Gupy)
 * - Redes Sociais (Instagram, LinkedIn, Facebook)
 * - Notas Fiscais e Sintegra / Sefaz
 */
export function buildDeepSearchLinks(name: string, company?: string, location?: string, cnpj?: string): DeepSearchLinks {
  const targetName = (company || name || '').trim();
  const city = (location || '').split('-')[0].trim();
  const cleanCnpj = (cnpj || '').replace(/\D/g, '');

  const qCartorio = cleanCnpj 
    ? `"${cleanCnpj}" OR "${targetName}" "contrato social" OR "junta comercial" OR "cartório" OR "registro civil" telefone`
    : `"${targetName}" "${city}" "contrato social" OR "junta comercial" OR "cartório" OR "qsa" telefone`;

  const qDiarioOficial = `"${targetName}" "${city}" "diário oficial" OR "dou" OR "doe" OR "dom" OR "jusbrasil" telefone`;

  const qLicitacoes = `"${targetName}" "${city}" "licitação" OR "comprasnet" OR "pncp" OR "edital" OR "ata de registro de preço" telefone`;

  const qVagas = `"${targetName}" "${city}" "vaga" OR "oportunidade" OR "catho" OR "vagas.com" OR "gupy" OR "infojobs" OR "linkedin jobs" telefone whatsapp`;

  const qRedesSociais = `"${targetName}" "${city}" (site:instagram.com OR site:facebook.com OR site:linkedin.com/company) telefone whatsapp`;

  const qNfe = cleanCnpj
    ? `"${cleanCnpj}" "sintegra" OR "sefaz" OR "nota fiscal" OR "danfe" telefone`
    : `"${targetName}" "${city}" "sintegra" OR "sefaz" OR "nota fiscal" OR "danfe" telefone`;

  const qGeral = `"${targetName}" "${city}" telefone whatsapp compras contato celular`;

  return {
    cartorio: `https://www.google.com/search?q=${encodeURIComponent(qCartorio)}`,
    diarioOficial: `https://www.google.com/search?q=${encodeURIComponent(qDiarioOficial)}`,
    licitacoes: `https://www.google.com/search?q=${encodeURIComponent(qLicitacoes)}`,
    vagasEmprego: `https://www.google.com/search?q=${encodeURIComponent(qVagas)}`,
    redesSociais: `https://www.google.com/search?q=${encodeURIComponent(qRedesSociais)}`,
    notaFiscalSintegra: `https://www.google.com/search?q=${encodeURIComponent(qNfe)}`,
    googleBuscaGeral: `https://www.google.com/search?q=${encodeURIComponent(qGeral)}`,
  };
}

/**
 * Resolves the contact telephone / WhatsApp number accurately.
 * 
 * Strict rule: NEVER fabricates fake 9-digit numbers!
 * Uses authentic verified business numbers (mobile or commercial landline registered on WhatsApp Business).
 */
export function resolveWhatsAppNumber(contact: Partial<Contact>): ResolvedWhatsApp {
 const raw = contact.decisionMakerPhone || contact.whatsapp || contact.phone || contact.establishmentPhone || '';
 const valid = validateBrazilianPhone(raw);
 const clean = valid.isValid ? `55${valid.cleanDigits}` : '';
 const records = Object.values(contact.evidence || {});
 return {displayPhone:valid.isValid ? raw : '',cleanPhone:clean,isMobile:isMobile(raw),
  establishmentPhone:contact.establishmentPhone || '',decisionMakerRole:contact.decisionMaker || 'Responsável não identificado',
  isVerifiedReal:false,callUrl:clean ? `tel:+${clean}` : '',
  searchUrl:`https://www.google.com/search?q=${encodeURIComponent(`${contact.company || contact.name || ''} telefone`)}`,
  legalSource:contact.legalSource || '',sourcesChecked:[...new Set(records.map(r => r.source))],sourcesFound:[...new Set(records.map(r => r.sourceUrl))],
  deepSearchLinks:buildDeepSearchLinks(contact.name || '',contact.company,contact.location,contact.cnpj)};
}

/**
 * Async helper to call /api/contacts/resolve-phone for real-time investigation
 * across all 6 public sources (Cartório, Diários Oficiais, Licitações, Redes Sociais, Vagas, NF-e).
 */
export async function consultMultiSourcePhone(contact: Partial<Contact>, customApiKey?: string) {
  try {
    const res = await fetch('/api/contacts/resolve-phone', {
      method: 'POST',
      headers: await apiHeaders(),
      body: JSON.stringify({
        name: contact.name,
        company: contact.company,
        cnpj: contact.cnpj,
        location: contact.location,
        entityType: contact.entityType,
        category: contact.category,
        currentPhone: contact.phone || contact.decisionMakerPhone,
        customApiKey,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Falha HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    throw err;
  }
}

/**
 * Generates the direct WhatsApp Web URL with clean parameters.
 */
export function buildWhatsAppUrl(cleanPhone: string, text?: string): string {
  // Ensure country code 55
  let phone = cleanPhone.replace(/\D/g, '');
  if (!phone.startsWith('55')) {
    phone = `55${phone}`;
  }
  const baseUrl = `https://wa.me/${phone}`;
  if (text) {
    return `${baseUrl}?text=${encodeURIComponent(text)}`;
  }
  return baseUrl;
}
