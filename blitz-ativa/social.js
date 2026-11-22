import {extract} from './extract.js';

// Reuse the same product, date, region and contextual checks for observed DOM/API comments.
export function socialEvidence(rows, input, now = Date.now()) {
  const records = new Map();
  for (const row of rows.slice(0,200)) {
    if (!row || typeof row.text !== 'string' || typeof row.name !== 'string' || !row.sourceUrl) continue;
    const object = {'@type':'Comment',text:row.text,
      author:{'@type':row.entityType === 'pj' ? 'Organization' : 'Person',name:row.name},
      datePublished:row.publishedAt,url:row.sourceUrl,
      ...(row.context ? {inReplyTo:{'@type':'SocialMediaPosting',text:row.context,url:row.contextUrl || row.sourceUrl}} : {})};
    const result = extract(`<script type="application/ld+json">${JSON.stringify(object).replace(/</g,'\\u003c')}</script>`,row.sourceUrl,input,now);
    for (const record of result.records) {
      record.authorProfileUrl = row.authorUrl || '';
      record.parentPublicationUrl = row.contextUrl || row.sourceUrl;
      record.platform = row.platform;
      record.evidence.intent.source = row.collector || 'API oficial de comentários públicos';
      records.set(record.key,record);
    }
  }
  return [...records.values()];
}
