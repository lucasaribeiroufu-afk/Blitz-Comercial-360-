// Runs in the browser. Only visible public DOM blocks; never merge text across authors.
export function extractVisible(platform) {
  const visible = node => !!node && !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  const text = node => visible(node) ? node.innerText?.trim() || '' : '';
  const records=[];
  const selectors = platform==='instagram' ? 'article' : platform==='facebook' ? '[role="article"]' : '[data-e2e="browse-video-desc"], [data-e2e="video-desc"], [data-e2e="comment-level-1"], [data-e2e="comment-level-2"]';
  const add=(block, content, author, kind, permalink, context = null)=>{
    if (!visible(block) || !content || !author || !text(content)) return;
    const scope = node => node.closest('li,[role="article"][aria-label],[data-e2e="comment-level-1"],[data-e2e="comment-level-2"]');
    if (kind === 'comment' && (scope(content) !== block || scope(author) !== block)) return;
    const time=Array.from(block.querySelectorAll('time[datetime]')).find(node=>kind !== 'comment' || scope(node) === block);
    records.push({text:text(content).slice(0,6000),name:text(author).slice(0,150),authorUrl:author.href||'',sourceUrl:permalink?.href || location.href,publishedAt:time?.getAttribute('datetime')||'',id:permalink?.href||'',recordKind:kind,context:(context?.text || '').slice(0,6000),contextUrl:context?.url || ''});
  };
  for(const block of document.querySelectorAll(selectors)) {
    if (!visible(block)) continue;
    if(platform==='instagram') {
      const caption=block.querySelector('h1');
      const owner=block.querySelector('header a[href]');
      add(block,caption,owner,'post',null);
      for(const comment of block.querySelectorAll('ul li')) {
        // The author must belong to the same comment block; never use the post owner.
        const author=comment.querySelector('h3 a[href], h2 a[href]');
        const content=Array.from(comment.querySelectorAll('span[dir="auto"]')).find(node=>node.closest('li') === comment && !node.closest('h2,h3'));
        add(comment,content,author,'comment',comment.querySelector('a[href*="comment_id"]'),{text:text(caption),url:location.href});
      }
    } else if(platform==='facebook') {
      const content=block.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"]');
      const owner=block.querySelector('h2 a[href], h3 a[href], strong a[href]');
      const link=Array.from(block.querySelectorAll('a[href]')).find(a=>/\/(posts|permalink)\//.test(a.href));
      add(block,content,owner,block.getAttribute('aria-label')?.toLowerCase().includes('comment')?'comment':'post',link);
      for(const comment of block.querySelectorAll('[role="article"][aria-label]')) {
        add(comment,comment.querySelector('[dir="auto"]'),comment.querySelector('a[role="link"][href]'),'comment',comment.querySelector('a[href*="comment_id"]'),{text:text(content),url:link?.href || location.href});
      }
    } else {
      const isComment=block.matches('[data-e2e^="comment-level"]');
      if(isComment) {
        const captions=Array.from(document.querySelectorAll('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]')).filter(visible);
        const context=/\/video\/\d+/.test(location.pathname) && captions.length === 1 ? {text:text(captions[0]),url:location.href} : null;
        add(block,block.querySelector('[data-e2e="comment-text"]'),block.querySelector('a[href*="/@"]'),'comment',null,context);
      }
      else {
        const container=block.closest('[data-e2e="browse-video"], [data-e2e="recommend-list-item-container"]') || document;
        const owner=container.querySelector('[data-e2e="browse-username"] a[href], a[data-e2e="browse-username"], a[data-e2e="video-author-uniqueid"]');
        add(block,block,owner,'post',null);
      }
    }
  }
  return {records,links:Array.from(document.querySelectorAll('a[href]')).filter(visible).map(a=>a.href).slice(0,500),title:document.title,body:document.body?.innerText.slice(0,30000)||'',password:!!Array.from(document.querySelectorAll('input[type="password"]')).find(visible),challenge:!!document.querySelector('iframe[src*="captcha"], [id*="captcha"], [class*="captcha"]')};
}
