import {protectedHandler} from '../src/server/serverAuth.js';
import {ativaAction} from '../src/server/ativa.js';
import {sweepSchedules} from '../src/server/ativaSchedules.js';
const interactive = protectedHandler(ativaAction);
export default async function handler(req,res) {
  if (req.method !== 'GET') return interactive(req,res);
  res.setHeader('Cache-Control','no-store');
  try {return res.status(200).json(await sweepSchedules(req));}
  catch (error) {return res.status(error.status || 500).json({error:error.message});}
}
