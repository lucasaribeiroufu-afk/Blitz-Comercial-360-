import type { Contact } from '../types';

export const VALID_BRAZILIAN_DDDS = new Set([
  // SP
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  // RJ & ES
  '21', '22', '24', '27', '28',
  // MG
  '31', '32', '33', '34', '35', '37', '38',
  // PR & SC
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  // RS
  '51', '53', '54', '55',
  // DF, GO, TO, MT, MS, RO, AC
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  // BA & SE
  '71', '73', '74', '75', '77', '79',
  // PE, AL, PB, RN, CE, PI
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  // PA, AM, AP, RR, MA
  '91', '92', '93', '94', '95', '96', '97', '98', '99'
]);

const FORBIDDEN_DUMMY_NAMES = [
  'teste', 'test', 'lead teste', 'empresa teste', 'exemplo', 
  'contato exemplo', 'placeholder', 'null', 'undefined', 'n/a',
  'desconhecido', 'sem nome', 'fake', 'dummy',
  'tatiane lima fonseca', 'larissa vasconcelos freitas', 'ana paula martins medeiros',
  'maria clara albuquerque', 'joão pedro silveira', 'silvia regina duarte',
  'lucas mendonça santos', 'camila ribeiro guimarães'
];

const KNOWN_INVALID_NUMBERS = new Set([
  '34985483901', '985483901',
  '34980418252', '980418252',
  '34993755124', '993755124',
  '34987654321', '987654321'
]);

/**
 * Valida a higidez de um número de telefone brasileiro
 */
export function validateBrazilianPhone(rawPhone: string | undefined | null): {
  isValid: boolean;
  cleanDigits: string;
  ddd: string;
  reason?: string;
} {
  if (!rawPhone) {
    return { isValid: false, cleanDigits: '', ddd: '', reason: 'Telefone ausente ou vazio' };
  }

  let digits = rawPhone.replace(/\D/g, '');

  // Se inicia com 55 e tem mais de 11 dígitos, remove código do país
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // DDD são os 2 primeiros dígitos
  const ddd = digits.slice(0, 2);

  if (!VALID_BRAZILIAN_DDDS.has(ddd)) {
    return { isValid: false, cleanDigits: digits, ddd, reason: `DDD ${ddd} não é um DDD brasileiro válido` };
  }

  // Celular (11 dígitos, inicia com 9 após DDD) ou Fixo comercial (10 dígitos, inicia com 2, 3, 4 ou 5)
  if (digits.length === 11) {
    const ninthDigit = digits.charAt(2);
    if (ninthDigit !== '9') {
      return { isValid: false, cleanDigits: digits, ddd, reason: 'Celular deve iniciar com o dígito 9 após o DDD' };
    }
  } else if (digits.length === 10) {
    const firstDigit = digits.charAt(2);
    if (!['2', '3', '4', '5'].includes(firstDigit)) {
      return { isValid: false, cleanDigits: digits, ddd, reason: 'Telefone fixo deve iniciar com 2, 3, 4 ou 5 após o DDD' };
    }
  } else {
    return { isValid: false, cleanDigits: digits, ddd, reason: `Quantidade de dígitos inválida (${digits.length} dígitos; esperado 10 ou 11)` };
  }

  const subscriberNumber = digits.slice(2);

  // Rejeita números conhecidos inexistentes ou fictícios
  if (KNOWN_INVALID_NUMBERS.has(digits) || KNOWN_INVALID_NUMBERS.has(subscriberNumber)) {
    return { isValid: false, cleanDigits: digits, ddd, reason: 'Número inexistente ou detectado como fictício' };
  }

  // Rejeita sequências repetidas fictícias (ex: 999999999, 000000000, 111111111)
  if (/^(\d)\1+$/.test(subscriberNumber)) {
    return { isValid: false, cleanDigits: digits, ddd, reason: 'Número com dígitos repetidos fictícios' };
  }

  // Rejeita sequências dummy óbvias (ex: 12345678, 98765432)
  if (subscriberNumber.includes('12345678') || subscriberNumber.includes('98765432') || subscriberNumber === '999999999') {
    return { isValid: false, cleanDigits: digits, ddd, reason: 'Sequência numérica sequencial de teste' };
  }

  return { isValid: true, cleanDigits: digits, ddd };
}

export interface VeracityAuditResult {
  isReal: boolean;
  veracityScore: number; // 0 a 100
  reason: string;
  flags: string[];
}

/**
 * Analisa e audita a veracidade de um contato individual da base
 */
export function auditContactVeracity(contact: Contact): VeracityAuditResult {
 const records = contact.evidence || {};
 const nameEvidence = records.name;
 const hasEvidence = Boolean(nameEvidence && nameEvidence.value === contact.name && /^https:\/\//.test(nameEvidence.sourceUrl) && !Number.isNaN(Date.parse(nameEvidence.retrievedAt)));
 return {isReal:hasEvidence, veracityScore:0,
   reason:hasEvidence ? 'Registro com proveniência de coleta. Não comprova telefone ativo, identidade do decisor ou compra atual.' : 'Sem proveniência de coleta. Formato de telefone e CNPJ não comprovam veracidade.',
   flags:hasEvidence ? ['PROVENIENCIA_DE_COLETA','TELEFONE_ATIVO_NAO_TESTADO'] : ['SEM_PROVENIENCIA']};
}

export interface DatabaseAuditSummary {
  total: number;
  realCount: number;
  unverifiedCount: number;
  realContacts: Contact[];
  unverifiedContacts: Contact[];
  unverifiedIds: string[];
}

/**
 * Audita uma lista completa de contatos cadastrados
 */
export function auditContactList(contacts: Contact[]): DatabaseAuditSummary {
  const realContacts: Contact[] = [];
  const unverifiedContacts: Contact[] = [];
  const unverifiedIds: string[] = [];

  contacts.forEach((c) => {
    const result = auditContactVeracity(c);
    const enriched = {
      ...c,
      isVerifiable: result.isReal,
      veracityScore: result.veracityScore,
      veracityReason: result.reason
    };

    if (result.isReal) {
      realContacts.push(enriched);
    } else {
      unverifiedContacts.push(enriched);
      if (c.id) {
        unverifiedIds.push(c.id);
      }
    }
  });

  return {
    total: contacts.length,
    realCount: realContacts.length,
    unverifiedCount: unverifiedContacts.length,
    realContacts,
    unverifiedContacts,
    unverifiedIds
  };
}
