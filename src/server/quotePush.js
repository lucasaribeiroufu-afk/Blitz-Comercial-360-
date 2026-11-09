import { generateVAPIDKeys, sendNotification } from 'web-push';
import { SearchError } from './verifiedSearch.js';

const configRef = db => db.collection('_blitzQuotePush').doc('vapid');
const deviceRef = (db, owner) => db.collection('_blitzQuotePushDevices').doc(owner);

export function validateSubscription(value) {
  let endpoint;
  try { endpoint = new URL(value?.endpoint); } catch {
    throw new SearchError('Inscrição de notificações inválida.', 422);
  }
  const host = endpoint.hostname;
  const supported = host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host === 'web.push.apple.com' || host.endsWith('.web.push.apple.com');
  const { p256dh, auth } = value?.keys || {};
  if (!supported || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.port || endpoint.hash || endpoint.href.length > 2048 ||
      typeof p256dh !== 'string' || !/^[\w-]{87}$/.test(p256dh) ||
      typeof auth !== 'string' || !/^[\w-]{22}$/.test(auth)) {
    throw new SearchError('Inscrição de notificações inválida.', 422);
  }
  return { endpoint: endpoint.href, keys: { p256dh, auth } };
}

export async function configureQuotePush(db, owner, body) {
  const device = deviceRef(db, owner);
  if (body.action === 'push-disable') {
    await device.delete();
    return { ok: true };
  }
  if (body.action === 'push-subscribe') {
    await device.set(validateSubscription(body.subscription));
    return { ok: true };
  }
  const ref = configRef(db);
  return db.runTransaction(async tx => {
    const stored = (await tx.get(ref)).data();
    if (stored) return { publicKey: stored.publicKey };
    const keys = generateVAPIDKeys();
    tx.set(ref, keys);
    return { publicKey: keys.publicKey };
  });
}

export async function notifyQuoteOwner(db, owner) {
  const device = deviceRef(db, owner);
  const subscription = (await device.get()).data();
  if (!subscription) return;
  const keys = (await configRef(db).get()).data();
  if (!keys) return;
  try {
    await sendNotification(validateSubscription(subscription), null, {
      TTL: 300,
      timeout: 3000,
      vapidDetails: { subject: 'https://blitz-comercial-360.vercel.app', ...keys },
    });
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await db.runTransaction(async tx => {
        if ((await tx.get(device)).data()?.endpoint === subscription.endpoint) tx.delete(device);
      });
      return;
    }
    throw error;
  }
}
