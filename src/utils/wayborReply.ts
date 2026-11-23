type ReplyContext = {
  name: string;
  product: string;
  category: string;
  comment: string;
};

export function wayborReply({name, product, category, comment}: ReplyContext): string {
  const givenName = /^@?([\p{L}]{2,30})(?=[\s._-]|$)/u.exec(name.trim())?.[1];
  const greeting = givenName ? `Olá, ${givenName}! Aqui é da Waybor.` : 'Olá! Aqui é da Waybor.';
  const subject = product.trim();
  const normalized = comment.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const needsMaterialComparison = /\bmao de obra\b/.test(normalized) && /\bmateria(?:l|is)\b/.test(normalized);
  const aboutRoof = /\btelhados?\b/i.test(subject);
  const details = aboutRoof
    ? 'Em qual cidade fica o imóvel? O telhado é de metal, fibrocimento ou outro material, e qual é a área aproximada?'
    : /antiderrapante/i.test(subject)
      ? 'Em qual cidade fica o local e que tipo de piso você quer avaliar?'
      : 'Em qual cidade você está e para que uso precisa do produto?';

  const context = needsMaterialComparison
    ? 'Vi que você quer comparar o custo com material e mão de obra com o valor só da aplicação. Posso ajudar a entender o que entra em cada opção.'
    : category === 'service_question'
      ? `Vi sua pergunta sobre a aplicação de ${subject}. Posso verificar as opções de fornecimento e de serviço para o seu caso.`
      : category === 'price_question'
        ? `Vi sua pergunta sobre o valor de ${subject}. Posso orientar o orçamento a partir do que você precisa.`
        : category === 'negative_experience'
          ? `Vi seu relato e posso ajudar a avaliar uma solução para ${subject}. O que ficou sem resolver?`
          : `Vi seu comentário sobre ${subject}. Posso ajudar a avaliar a opção mais adequada para o que você precisa.`;

  return [
    greeting,
    `${context} ${details}`,
    'Se for mais fácil pelo WhatsApp, responda só “WhatsApp” aqui que eu indico o canal comercial da Waybor para conversarmos em particular.',
  ].join('\n\n');
}

export function youtubeReplyTarget(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password ||
        !['www.youtube.com','youtube.com','m.youtube.com'].includes(url.hostname) || url.pathname !== '/watch') return null;
    const videoId = url.searchParams.get('v') || '';
    const commentId = url.searchParams.get('lc') || '';
    return /^[\w-]{11}$/.test(videoId) && /^[\w.-]{1,200}$/.test(commentId) ? {videoId, commentId} : null;
  } catch {
    return null;
  }
}
