import {intentAssessment} from '../src/server/purchaseIntent.js';
import {normalize} from '../src/server/verifiedSearch.js';
import {productRelevant} from './relevance.js';

const useEvidence = /\b(comprei|adquiri|paguei|uso|utilizo|usei|utilizei|apliquei|testei|ja usei)\b/;
const negativeExperience = /\b(nao gostei|nao funcionou|nao resolveu|sem solucao|nao apresentou solucao|decepcion\w*|ruim|pessim[oa]|escorrega)\b/;
const positiveExperience = /\b(gostei|adorei|funcionou|resolveu|recomendo|satisfeit[oa]|otim[oa]|excelente|deu certo|muito bom)\b/;
const repeatPurchase = /\b(quero comprar de novo|vou comprar de novo|quero comprar novamente|vou comprar novamente|quero recomprar|quero mais um|quero mais uma)\b/;
const explicitProductPraise = /\b(?:esse|este|essa|esta) (?:produto|tinta|impermeabilizante|revestimento) (?:e )?(?:bom|boa|otim[oa]|excelente|legal|bacana)\b/;

const commercialExclusion = /\b(nao quero|nao preciso|desisti|ja consegui|vendo|vendemos|compre agora|faca seu pedido)\b/;
const shortPriceQuestion = /^(?:qual (?:o )?(?:preco|valor)|quanto custa|quanto e)(?: (?:esse|este|esse produto|este produto))?$/;
const quoteQuestion = /\b(?:quanto (?:fica|ficaria|sai|sairia|custa|custaria|cobra(?:m)?)|qual (?:o )?(?:preco|valor)|(?:quanto|qual (?:o )?valor) (?:voces?|voce) cobra(?:m)?)\b.{0,100}\b(?:servico|trabalho|mao de obra|aplicacao|instalacao|material|por (?:m2|metro quadrado)|para (?:aplicar|instalar|impermeabilizar))\b/;
const serviceQuestion = /\b(?:voces?|voce|a empresa) (?:(?:tambem|so|apenas) )?(?:(?:faz(?:em)?|executa(?:m)?|realiza(?:m)?|presta(?:m)?) (?:o |a |esse |essa )?(?:servico|trabalho|aplicacao|instalacao|impermeabilizacao|orcamento)|(?:aplica(?:m)?|instala(?:m)?|impermeabiliza(?:m)?) (?:tambem|ou (?:apenas |so )?vendem|em (?:outra cidade|outras cidades|minha cidade))|(?:fornece(?:m)?|vende(?:m)?) .{0,60}\bcom (?:a )?(?:aplicacao|instalacao|mao de obra))\b/;

function commercialQuestionType(text) {
  if (commercialExclusion.test(text)) return null;
  if (shortPriceQuestion.test(text) || quoteQuestion.test(text)) return 'price_question';
  if (serviceQuestion.test(text)) return 'service_question';
  return null;
}

function relatedWaterproofingContext(query, context) {
  const requested = normalize(query);
  const observed = normalize(context);
  if (!/\btinta\b/.test(requested) || !/\bimpermeabil/.test(requested)) return false;
  return /\bborracha liquida\b/.test(observed) && /\bimpermeabil/.test(observed) &&
    (!/\btelhados?\b/.test(requested) || /\btelhados?\b/.test(observed));
}

export function demandSignal(text, query, alternatives = []) {
  const terms = [query, ...alternatives];
  for (const term of terms) {
    const assessment = intentAssessment(text, term);
    if (assessment.qualified) return {...assessment, type:'purchase_mention', relation:term === query ? 'direct' : 'alternative'};
  }
  const normalized = normalize(text);
  const matched = terms.find(term => normalize(term).split(' ').every(word => normalized.split(' ').includes(word)));
  if (!matched || commercialExclusion.test(normalized)) return null;
  const purchased = useEvidence.test(normalized);
  let type;
  const commercial = commercialQuestionType(normalized);
  if (commercial) type = commercial;
  else if (repeatPurchase.test(normalized)) type = 'repurchase_interest';
  else if (purchased && negativeExperience.test(normalized)) type = 'negative_experience';
  else if (purchased && positiveExperience.test(normalized)) type = 'positive_experience';
  else if (explicitProductPraise.test(normalized)) type = 'product_reaction';
  else if (purchased) type = 'past_purchase';
  else if (/\b(qual (o )?preco|quanto custa|qual (o )?valor)\b/.test(normalized)) type = 'price_question';
  if (!type) return null;
  const price = text.match(/\b(?:paguei|comprei por|custou)\s*(R\$\s*\d[\d.,]*)/i)?.[1];
  return {type, matchedProduct:matched, relation:matched === query ? 'direct' : 'alternative',
    classification:'heuristic_public_signal', ...(['repurchase_interest','product_reaction'].includes(type) ? {reviewRequired:true} : {}), ...(price ? {reportedPrice:price} : {})};
}

export function contextualSignal(text, context, query, alternatives = []) {
  const n = normalize(text);
  if (commercialExclusion.test(n)) return null;
  const commercial = commercialQuestionType(n);
  const terms = [query,...alternatives];
  const matches = terms.filter(term=>productRelevant(context,{query:term}));
  // Several products in the parent make a short reply ambiguous.
  if (!matches.length && commercial && relatedWaterproofingContext(query,context)) matches.push('borracha líquida');
  if (matches.length !== 1) return null;
  let type;
  if (/^(?:quero comprar|preciso comprar|quero adquirir)(?: (?:esse|este|esse produto|este produto|isso))?$/.test(n)) type = 'purchase_mention';
  else if (commercial) type = commercial;
  else if (repeatPurchase.test(n)) type = 'repurchase_interest';
  else if (useEvidence.test(n) && negativeExperience.test(n)) type = 'negative_experience';
  else if (useEvidence.test(n) && positiveExperience.test(n)) type = 'positive_experience';
  else if (explicitProductPraise.test(n)) type = 'product_reaction';
  else if (/^(?:legal|bacana|muito legal|muito bacana|gostei|show)$/.test(n))
    type = 'general_reaction';
  if (!type) return null;
  return {type,matchedProduct:matches[0],relation:matches[0] === query ? 'direct' : 'alternative',
    classification:'contextual_public_signal',reviewRequired:true};
}
