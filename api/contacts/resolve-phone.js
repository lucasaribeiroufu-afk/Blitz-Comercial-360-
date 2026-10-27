import {protectedHandler} from '../../src/server/serverAuth.js';
import {resolvePublicPhone} from '../../src/server/verifiedSearch.js';
export default protectedHandler(resolvePublicPhone);
