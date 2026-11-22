const kind = object => [object?.['@type']].flat();
const publication = object => kind(object).some(type=>['SocialMediaPosting','DiscussionForumPosting','Comment','Article','BlogPosting','Review'].includes(type));
const body = object => [object.headline,object.name,object.text,object.articleBody,object.reviewBody].filter(value=>typeof value === 'string').join('\n').slice(0,12000);

export function observations(structured, $) {
  const output = [], seen = new Set();
  const indexed = new Map(structured.filter(item=>item['@id']).map(item=>[item['@id'],item]));
  function visit(object, parent, depth = 0) {
    if (!object || typeof object !== 'object' || depth > 6 || seen.has(object)) return;
    seen.add(object);
    if (publication(object)) {
      const reply = object.inReplyTo;
      const reference = typeof reply === 'string' ? indexed.get(reply) : indexed.get(reply?.['@id']) || reply;
      const context = reference || parent;
      output.push({text:object.text || object.articleBody || object.reviewBody,author:object.author,
        publishedAt:object.datePublished,url:object.url || object['@id'],
        context:context ? body(context) : '',contextUrl:context?.url || context?.['@id']});
    }
    for (const field of ['comment','review','mainEntity','itemListElement'])
      for (const child of [object[field]].flat().filter(Boolean)) visit(child,object,depth+1);
  }
  structured.forEach(object=>visit(object));
  // Schema.org microdata is scoped per comment, preserving author/date boundaries.
  $('[itemscope][itemtype$="/Comment"],[itemscope][itemtype$="/Review"]').slice(0,200).each((_index,element)=>{
    const node = $(element);
    const own = property=>node.find(`[itemprop="${property}"]`).filter((_i,item)=>$(item).closest('[itemscope][itemtype$="/Comment"],[itemscope][itemtype$="/Review"]')[0] === element).first();
    const value = property=>{const item=own(property);return item.attr('content') || item.attr('datetime') || item.attr('href') || item.text().trim();};
    const author = own('author');
    const parent = node.parents('[itemscope]').first();
    output.push({text:value('text') || value('reviewBody'),publishedAt:value('datePublished'),url:value('url'),
      author:{'@type':/Organization/.test(author.attr('itemtype') || '') ? 'Organization' : 'Person',
        name:author.find('[itemprop="name"]').first().text().trim() || author.attr('content') || author.text().trim()},
      context:parent.children('[itemprop="headline"],[itemprop="name"],[itemprop="text"]').text().slice(0,12000),
      contextUrl:parent.children('[itemprop="url"]').attr('href')});
  });
  return output.slice(0,300);
}
