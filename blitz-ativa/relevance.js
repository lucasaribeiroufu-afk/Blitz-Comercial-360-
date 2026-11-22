import {normalize} from '../src/server/verifiedSearch.js';
import {productVariants} from '../src/server/purchaseIntent.js';

// Discovery relevance is a prefilter. A buyer still needs original dated evidence.
export function productRelevant(text, input) {
  const observed = new Set(normalize(text).split(' '));
  const variants = [...productVariants(input.query),...(input.alternatives || [])];
  return variants.some(variant=>{
    const words = normalize(variant).split(' ').filter(word=>!['de','da','do','para','com','e','em'].includes(word));
    return words.length > 0 && words.every(word=>observed.has(word) || observed.has(`${word}s`) ||
      (word.endsWith('s') && observed.has(word.slice(0,-1))));
  });
}
