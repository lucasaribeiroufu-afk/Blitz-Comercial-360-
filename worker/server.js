import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {collectBatch} from './collector.js';
let active=0;
export function authorized(value,expected) {const actual=String(value||'').replace(/^Bearer /,'');return Buffer.byteLength(actual)===Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
export function createHandler(collect=collectBatch) { return async(req,res)=>{
  const token=process.env.SOCIAL_WORKER_TOKEN;
  const configured=Boolean(token && token.length>=32);
  if(req.url==='/health'&&req.method==='GET')return send(res,200,{status:configured?'ok':'configuration_required',configured,collector:'public-dom',platforms:['instagram','facebook','tiktok']});
  if(req.url!=='/collect'||req.method!=='POST')return send(res,404,{error:'Not found'});
  if(!configured)return send(res,503,{error:'SOCIAL_WORKER_TOKEN deve ter ao menos 32 caracteres; configure secret no servidor'});
  if(!authorized(req.headers.authorization,token))return send(res,401,{error:'Worker não autorizado'});
  if(active>=1)return send(res,429,{error:'Worker ocupado; tente novamente sem cobrança'});
  active++;
  try {
    let body='',size=0;
    for await(const chunk of req){size+=chunk.length;if(size>12000){send(res,413,{error:'Corpo excede limite'});req.destroy();return;}body+=chunk;}
    const parsed=req.body;
    if(parsed!==undefined && Buffer.byteLength(typeof parsed==='string'?parsed:JSON.stringify(parsed))>12000)return send(res,413,{error:'Corpo excede limite'});
    const input=parsed!==undefined?(typeof parsed==='string'?JSON.parse(parsed):parsed):JSON.parse(body);
    if(!input || typeof input!=='object')return send(res,400,{error:'Informe nicho e cidade'});
    if(typeof input.query!=='string'||input.query.length>300||typeof input.location!=='string'||input.location.length>160||!input.query.trim()||!input.location.trim())return send(res,400,{error:'Informe nicho e cidade'});
    const result=await collect(input);return send(res,200,result);
  }catch(e){return send(res,502,{error:String(e.message).slice(0,300)});}finally{active--;}
}; }
export default createHandler();
if (!process.env.VERCEL && process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const server=http.createServer(createHandler());
  server.requestTimeout=25000;server.headersTimeout=10000;
  server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Blitz public worker started'));
}
