import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {socialSource,publication,publicAuthor} from '../urls.js';
import {extractVisible} from '../extract.js';
import {gate} from '../collector.js';
test('scope rejects credentials, deceptive hosts, login, non-social targets and enumeration',()=>{
 for(const url of ['http://instagram.com/p/x/','https://www.instagram.com.evil.test/p/x/','https://user:pass@www.instagram.com/p/x/','https://127.0.0.1/x','https://www.instagram.com/accounts/login/','https://www.facebook.com/search/','https://www.tiktok.com/@x?email=someone@example.test']){
  if(url.includes('?email'))assert.equal(socialSource(url).url.includes('email'),false);
  else assert.throws(()=>socialSource(url));
 }
 assert.equal(publication('https://www.instagram.com/store/','instagram'),'');
 assert.equal(publicAuthor('https://www.instagram.com/p/ABC/','instagram'),'');
 assert.equal(publicAuthor('https://www.tiktok.com/@same','instagram'),'');
 assert.equal(publicAuthor('https://www.facebook.com/profile.php?id=123','facebook'),'https://www.facebook.com/profile.php?id=123');
 assert.throws(()=>socialSource('https://www.facebook.com/profile.php')); 
});
test('login, CAPTCHA and private group gates stop extraction',()=>{
 for(const snapshot of [{password:true},{challenge:true},{title:'Private group'},{body:'Faça login para continuar'}])assert.throws(()=>gate({title:'',body:'',...snapshot},'https://www.facebook.com/store/'));
});
test('real Chromium runtime parses separate public DOM fixtures for each platform',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 try {
  const page=await browser.newPage();
  const fixtures=[
   ['instagram','<article><header><a href="https://www.instagram.com/seller/">seller</a></header><h1>Vendo tinta</h1><ul><li><h3><a href="https://www.instagram.com/buyer/">buyer</a></h3><span dir="auto">Quero comprar tinta. Moro em Paracatu MG</span><time datetime="2026-10-14"></time></li></ul></article>'],
   ['facebook','<div role="article"><h2><a href="https://www.facebook.com/seller/">seller</a></h2><div data-ad-preview="message">Vendo tinta</div><a href="https://www.facebook.com/seller/posts/123/">post</a><div role="article" aria-label="comment"><a role="link" href="https://www.facebook.com/buyer/">buyer</a><div dir="auto">Quero comprar tinta. Moro em Paracatu MG</div></div></div>'],
   ['tiktok','<div data-e2e="comment-level-1"><a href="https://www.tiktok.com/@buyer">buyer</a><p data-e2e="comment-text">Quero comprar tinta. Moro em Paracatu MG</p></div>'],
  ];
  for(const [platform,html] of fixtures){await page.setContent(html);const result=await page.evaluate(extractVisible,platform);const buyer=result.records.find(r=>r.name==='buyer');assert.ok(buyer,platform);assert.match(buyer.text,/Quero comprar tinta/);assert.ok(!buyer.authorUrl.includes('seller'));assert.equal(buyer.recordKind,'comment');}
  await page.setContent('<article style="display:none"><header><a href="https://www.instagram.com/private/">private</a></header><h1>Quero comprar tinta</h1></article>');assert.equal((await page.evaluate(extractVisible,'instagram')).records.length,0);
 }finally{await browser.close();}
});
