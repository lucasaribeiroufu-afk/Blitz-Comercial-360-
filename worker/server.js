import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {collectBatch} from './collector.js';
let active=0;
const token=process.env.SOCIAL_WORKER_TOKEN;
if(!token || token.length<32)throw Error('SOCIAL_WORKER_TOKEN deve ter ao menos 32 caracteres; configure secret no servidor');
export function authorized(value,expected) {const actual=String(value||'').replace(/^Bearer /,'');return Buffer.byteLength(actual)===Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  if(req.url==='/health'&&req.method==='GET')return send(res,200,{status:'ok',collector:'public-dom',platforms:['instagram','facebook','tiktok']});
  if(req.url!=='/collect'||req.method!=='POST')return send(res,404,{error:'Not found'});
  if(!authorized(req.headers.authorization,token))return send(res,401,{error:'Worker não autorizado'});
  if(active>=1)return send(res,429,{error:'Worker ocupado; tente novamente sem cobrança'});
  active++;
  try {
    let body='',size=0;
    for await(const chunk of req){size+=chunk.length;if(size>12000){send(res,413,{error:'Corpo excede limite'});req.destroy();return;}body+=chunk;}
    const input=JSON.parse(body);
    if(typeof input.query!=='string'||input.query.length>300||typeof input.location!=='string'||input.location.length>160||!input.query.trim()||!input.location.trim())return send(res,400,{error:'Informe nicho e cidade'});
    const result=await collectBatch(input);return send(res,200,result);
  }catch(e){return send(res,502,{error:String(e.message).slice(0,300)});}finally{active--;}
});
server.requestTimeout=25000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Blitz public worker started'));
