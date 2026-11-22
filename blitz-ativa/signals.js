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
  if (purchased && /\b(nao gostei|nao funcionou|nao resolveu|decepcion|ruim|pessimo|escorrega)\b/.test(normalized)) type = 'negative_experience';
  else if (purchased && /\b(gostei|funcionou|resolveu|recomendo|satisfeito|otimo)\b/.test(normalized)) type = 'positive_experience';
  else if (purchased) type = 'past_purchase';
  else if (/\b(qual (o )?preco|quanto custa|qual (o )?valor)\b/.test(normalized)) type = 'price_question';
  if (!type) return null;
  const price = text.match(/\b(?:paguei|comprei por|custou)\s*(R\$\s*\d[\d.,]*)/i)?.[1];
  return {type, matchedProduct:matched, relation:matched === query ? 'direct' : 'alternative',
    classification:'heuristic_public_signal', ...(price ? {reportedPrice:price} : {})};
}
