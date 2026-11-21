import {readFile} from 'node:fs/promises';
import {config} from './config.js';
import {Store} from './store.js';
import {run} from './runner.js';

const filename = process.argv[2];
if (!filename) throw Error('Uso: npm run ativa:run -- caminho/config.json');
const input = config(JSON.parse(await readFile(filename, 'utf8')));
const store = new Store(process.env.BLITZ_ATIVA_DB || 'blitz-ativa/data/blitz.sqlite');
const queued = store.create(input);
// The API worker may share this database. Only its atomic claimant executes a job.
let selected;
while ((selected = store.claim())) {
  const heartbeat = setInterval(() => store.heartbeat(selected), 10000);
  try {
    const output = await run(selected.input);
    store.finish(selected, output.records, output.report);
  } catch (error) {store.finish(selected, [], {state:'failed'}, error.message);}
  finally {clearInterval(heartbeat);}
  if (selected.id === queued.id) break;
}
console.info(JSON.stringify(store.get(queued.id), null, 2));
store.close();
