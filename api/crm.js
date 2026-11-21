import { protectedHandler } from '../src/server/serverAuth.js';
import { mutateCrm } from '../src/server/crm.js';

export default protectedHandler(mutateCrm);
