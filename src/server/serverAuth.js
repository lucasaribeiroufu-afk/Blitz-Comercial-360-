import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import config from '../../firebase-applet-config.json' with {type:'json'};
import {makeHandler,SearchError} from './verifiedSearch.js';
export async function requireUser(req, verifyToken) {
 const token=String(req.headers?.authorization || '').match(/^Bearer (.+)$/)?.[1];
 if(!token)throw new SearchError('Entre no aplicativo para executar a coleta.',401);
 try {
  const app=getApps().find(app=>app.name==='blitz-server') || initializeApp({projectId:config.projectId},'blitz-server');
  const user=await (verifyToken || (token=>getAuth(app).verifyIdToken(token)))(token);
  const allowed=String(process.env.BLITZ_ALLOWED_UIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(allowed.length&&!allowed.includes(user.uid))throw new SearchError('Conta sem permissão para executar coletas.',403);
  return user.uid;
 }catch(err){if(err instanceof SearchError)throw err;throw new SearchError('Sessão inválida ou expirada. Entre novamente no aplicativo.',401);}
}
export function protectedHandler(operation, verifyToken) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  try {const userId=await requireUser(req,verifyToken);return makeHandler(body=>operation(body,{userId}))(req,res);}
  catch(err){return res.status(err.status||500).json({error:err.message});}
 };
}
