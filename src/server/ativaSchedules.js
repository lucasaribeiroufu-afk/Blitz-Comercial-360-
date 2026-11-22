import {timingSafeEqual, randomUUID} from 'node:crypto';
import {getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import firebase from '../../firebase-applet-config.json' with {type:'json'};
import {getServerFirestore} from './radarStore.js';
import {embeddedRequest} from './ativaEmbedded.js';
import {config} from '../../blitz-ativa/config.js';
import {SearchError} from './verifiedSearch.js';

export async function scheduleAction(body, deps = {}) {
  const db = deps.ativaDb || getServerFirestore();
  const ref = db.collection('_blitzAtivaSchedules').doc(deps.userId);
  const configured = String(process.env.BLITZ_ATIVA_CRON_SECRET || '').length >= 32;
  if (body.action === 'schedule') return {schedule:(await ref.get()).data() || null,configured};
  const intervalMinutes = body.intervalMinutes;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080 || typeof body.enabled !== 'boolean')
    throw new SearchError('Informe intervalo de 15 minutos a 7 dias e estado ativo.',400);
  const input = config({...body,wide:true,discover:true});
  const value = {userId:deps.userId,input,intervalMinutes,enabled:body.enabled,
    nextAt:body.enabled ? Date.now() : 8640000000000000,leaseUntil:0,leaseToken:randomUUID(),currentJobId:null,seenKeys:[],updatedAt:new Date().toISOString()};
  await db.runTransaction(async transaction=>{
    const previous = (await transaction.get(ref)).data();
    transaction.set(ref,{...previous,...value,seenKeys:previous?.seenKeys || []});
  });
  return {schedule:value,configured};
}

async function scheduledSession(userId) {
  const app = getApps().find(item=>item.name === 'blitz-radar-store');
  if (!app) throw Error('Credenciais administrativas do agendador indisponíveis.');
  const customToken = await getAuth(app).createCustomToken(userId);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebase.apiKey}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:customToken,returnSecureToken:true}),signal:AbortSignal.timeout(7000),
  });
  if (!response.ok) throw Error(`Sessão do agendador HTTP ${response.status}`);
  const result = await response.json();
  if (!result.idToken) throw Error('Sessão do agendador ausente.');
  return result.idToken;
}

export async function sweepSchedules(req, deps = {}) {
  const expected = deps.cronSecret ?? process.env.BLITZ_ATIVA_CRON_SECRET ?? '';
  const actual = String(req.headers?.authorization || '').replace(/^Bearer /,'');
  if (expected.length < 32 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) throw new SearchError('Executor não autorizado.',401);
  const db = deps.ativaDb || getServerFirestore();
  const now = Date.now();
  const snapshot = await db.collection('_blitzAtivaSchedules').where('nextAt','<=',now).orderBy('nextAt').limit(1).get();
  if (!snapshot.docs.length) return {processed:0};
  const ref = snapshot.docs[0].ref;
  const leaseToken = randomUUID();
  const claimed = await db.runTransaction(async transaction=>{
    const schedule = (await transaction.get(ref)).data();
    if (!schedule?.enabled || schedule.nextAt > now || schedule.leaseUntil > now) return null;
    transaction.set(ref,{...schedule,leaseUntil:now+60000,leaseToken});
    return schedule;
  });
  if (!claimed) return {processed:0,busy:true};
  let changes, keys = [];
  try {
    const authToken = await (deps.scheduledSession || scheduledSession)(claimed.userId);
    const call = deps.scheduledRequest || embeddedRequest;
    const job = claimed.currentJobId
      ? await call(`/v1/jobs/${claimed.currentJobId}/continue`,claimed.userId,{}, {...deps,authToken})
      : await call('/v1/jobs',claimed.userId,{...claimed.input,requestKey:`schedule-${claimed.userId}-${claimed.nextAt}`},{...deps,authToken});
    keys = [...new Set((job.records || []).map(record=>record.key))];
    changes = {currentJobId:job.status === 'waiting' ? job.id : null,lastJobId:job.id,lastStatus:job.status,
      nextAt:now+(job.status === 'waiting' ? 60000 : claimed.intervalMinutes*60000),
      lastRunAt:new Date(now).toISOString(),lastError:null};
  } catch (error) {
    changes = {lastError:String(error.message).slice(0,300),nextAt:now+5*60000};
  }
  await db.runTransaction(async transaction=>{
    const current = (await transaction.get(ref)).data();
    if (current?.leaseToken !== leaseToken) return;
    const receipts = keys.map(key=>db.collection('users').doc(claimed.userId).collection('ativaSeen').doc(key));
    const snapshots = receipts.length ? await transaction.getAll(...receipts) : [];
    const fresh = snapshots.map((snapshot,index)=>({snapshot,ref:receipts[index]})).filter(item=>!item.snapshot.exists);
    changes.lastNewRecords = fresh.length;
    for (const item of fresh) transaction.set(item.ref,{firstSeenAt:new Date().toISOString(),jobId:changes.lastJobId});
    transaction.set(ref,{...current,...changes,leaseUntil:0});
  });
  return {processed:1,jobId:changes.lastJobId || null,status:changes.lastStatus || 'failed',newRecords:changes.lastNewRecords || 0};
}
