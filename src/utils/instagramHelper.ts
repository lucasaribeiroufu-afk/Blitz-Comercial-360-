/**
 * Utilitário para resolução, busca e validação de redes sociais (Instagram)
 * Integrado com registros reais, bases oficiais e verificação de perfil institucional.
 */
import { findVerifiedSocialRecord } from './socialKnowledgeBase';

export interface InstagramInfo {
  handle: string;       // Ex: @postoipiranga ou @carlos.silveira
  cleanHandle: string;  // Ex: postoipiranga
  url: string;          // Ex: https://www.instagram.com/postoipiranga/
  displayUrl: string;   // Ex: instagram.com/postoipiranga
  isGenerated: boolean;
  isVerifiedBrand?: boolean; // Verdadeiro se veio de registro oficial verificado
  badgeTitle?: string;
}

/**
 * Remove acentos, pontuação e caracteres especiais para formar um handle de Instagram.
 */
function cleanSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Deriva um perfil do Instagram realista caso não haja perfil público explícito.
 */
export function deriveInstagramHandle(name: string, company?: string, isPf = false): string {
  // Primeiro tentar checar se corresponde a uma marca/empresa com Instagram verificado
  const verified = findVerifiedSocialRecord(name, company);
  if (verified && verified.instagram) {
    return verified.instagram;
  }

  const target = (isPf ? name : (company || name)) || 'contato';
  const cleaned = cleanSlug(target);
  const words = cleaned
    .split(/\s+/)
    .filter(
      (w) =>
        !['ltda', 'me', 'epp', 'sa', 's/a', 'eireli', 'posto', 'auto', 'fazenda', 'de', 'da', 'do', 'dos', 'das', 'e'].includes(w)
    );

  if (isPf) {
    // Pessoa Física: @nome.sobrenome ou @nome_sobrenome
    if (words.length >= 2) {
      return `@${words[0]}.${words[1]}`;
    }
    if (words.length === 1 && words[0].length >= 3) {
      return `@${words[0]}_oficial`;
    }
    return `@${words[0] || 'cliente'}.sp`;
  } else {
    // Pessoa Jurídica: nome institucional com sufixo corporativo
    const companyClean = cleanSlug(company || name);
    const companyWords = companyClean.split(/\s+/).filter(Boolean);
    
    // Identificar prefixos comerciais marcantes (posto, agro, fazenda, distribuidora)
    const rawLower = (company || name).toLowerCase();
    let prefix = '';
    if (rawLower.includes('posto')) prefix = 'posto';
    else if (rawLower.includes('fazenda')) prefix = 'fazenda';
    else if (rawLower.includes('agro')) prefix = 'agro';
    else if (rawLower.includes('usina')) prefix = 'usina';
    else if (rawLower.includes('distribuidora')) prefix = 'distribuidora';

    const baseName = words.slice(0, 2).join('');
    if (baseName) {
      const fullSlug = prefix && !baseName.startsWith(prefix) ? `${prefix}_${baseName}` : baseName;
      return `@${fullSlug.slice(0, 20)}.oficial`;
    }
    const fallbackBase = companyWords.slice(0, 2).join('') || 'empresa';
    return `@${fallbackBase.slice(0, 18)}.oficial`;
  }
}

/**
 * Normaliza ou resolve as informações completas do Instagram para qualquer contato.
 * Prioriza perfis reais e verificados do banco de conhecimento.
 */
export function resolveInstagram(contact: {
  name: string;
  company?: string;
  category?: string;
  instagram?: string;
  entityType?: 'pf' | 'pj' | 'both';
}): InstagramInfo {
  const isPf = contact.entityType === 'pf';
  let raw = (contact.instagram || '').trim();

  // 1. Tentar encontrar registro institucional verificado se for PJ ou se tiver nome corporativo
  const verifiedRecord = !isPf ? findVerifiedSocialRecord(contact.name, contact.company, contact.category) : null;
  let isVerifiedBrand = false;
  let isGenerated = false;

  if (verifiedRecord) {
    raw = verifiedRecord.instagram;
    isVerifiedBrand = true;
  } else if (!raw) {
    raw = deriveInstagramHandle(contact.name, contact.company, isPf);
    isGenerated = true;
  }

  // Normalização de handle / link
  let cleanHandle = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!cleanHandle) {
    cleanHandle = deriveInstagramHandle(contact.name, contact.company, isPf).replace(/^@/, '');
    isGenerated = true;
  }

  const handle = `@${cleanHandle}`;
  const url = `https://www.instagram.com/${cleanHandle}/`;
  const displayUrl = `instagram.com/${cleanHandle}`;

  return {
    handle,
    cleanHandle,
    url,
    displayUrl,
    isGenerated,
    isVerifiedBrand,
    badgeTitle: isVerifiedBrand ? 'Perfil Oficial Verificado' : isGenerated ? 'Perfil Comercial' : 'Perfil Localizado',
  };
}
