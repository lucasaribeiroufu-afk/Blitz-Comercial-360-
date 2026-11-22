import {protectedHandler} from '../src/server/serverAuth.js';
import {ativaAction} from '../src/server/ativa.js';
export default protectedHandler(ativaAction);
