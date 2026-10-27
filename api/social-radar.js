import {protectedHandler} from '../src/server/serverAuth.js';
import {socialRadar} from '../src/server/socialRadar.js';
export default protectedHandler(socialRadar);
