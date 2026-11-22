import {intentAssessment} from '../src/server/purchaseIntent.js';
import {normalize} from '../src/server/verifiedSearch.js';

export function demandSignal(text, query, alternatives = []) {
  const terms = [query, ...alternatives];
  for (const term of terms) {
    const assessment = intentAssessment(text, term);
    if (assessment.qualified) return {...assessment, type:'purchase_mention', relation:term === query ? 'direct' : 'alternative'};
  }
  const normalized = normalize(text);
  const matched = terms.find(term => normalize(term).split(' ').every(word => normalized.split(' ').includes(word)));
  if (!matched || /\b(vendo|vendemos|compre agora|faca seu pedido)\b/.test(normalized)) return null;
  const purchased = /\b(comprei|adquiri|paguei|uso|utilizo)\b/.test(normalized);
  let type;
  if (purchased && /\b(nao gostei|nao funcionou|nao resolveu|sem solucao|nao apresentou solucao|decepcion|ruim|pessimo|escorrega)\b/.test(normalized)) type = 'negative_experience';
  else if (purchased && /\b(gostei|funcionou|resolveu|recomendo|satisfeito|otimo)\b/.test(normalized)) type = 'positive_experience';
  else if (purchased) type = 'past_purchase';
  else if (/\b(qual (o )?preco|quanto custa|qual (o )?valor)\b/.test(normalized)) type = 'price_question';
  if (!type) return null;
  const price = text.match(/\b(?:paguei|comprei por|custou)\s*(R\$\s*\d[\d.,]*)/i)?.[1];
  return {type, matchedProduct:matched, relation:matched === query ? 'direct' : 'alternative',
    classification:'heuristic_public_signal', ...(price ? {reportedPrice:price} : {})};
}

export function contextualSignal(text, context, query, alternatives = []) {
  const terms = [query,...alternatives];
  const words = normalize(context).split(' ');
  const matches = terms.filter(term=>normalize(term).split(' ').every(word=>words.includes(word)));
  // Several products in the parent make a short reply ambiguous.
  if (matches.length !== 1) return null;
  const n = normalize(text);
  if (/\b(nao quero|nao preciso|ja consegui|desisti|vendo|vendemos)\b/.test(n)) return null;
  let type;
  if (/^(?:quero comprar|preciso comprar|quero adquirir)(?: (?:esse|este|esse produto|este produto|isso))?$/.test(n)) type = 'purchase_mention';
  else if (/^(?:qual (?:o )?(?:preco|valor)|quanto custa|quanto e)(?: (?:esse|este|esse produto|este produto))?$/.test(n)) type = 'price_question';
  else if (/^(?:comprei|usei|utilizei)(?: (?:esse|este|isso|esse produto|este produto))? e (?:nao gostei|nao funcionou|nao resolveu|gostei|funcionou|resolveu)$/.test(n))
    type = /nao/.test(n) ? 'negative_experience' : 'positive_experience';
  if (!type) return null;
  return {type,matchedProduct:matches[0],relation:matches[0] === query ? 'direct' : 'alternative',
    classification:'contextual_public_signal',reviewRequired:true};
}
