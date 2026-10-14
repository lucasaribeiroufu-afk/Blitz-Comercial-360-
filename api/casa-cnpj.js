import {protectedHandler} from '../src/server/serverAuth.js';
import {casaCnpjLookup} from '../src/server/verifiedSearch.js';
export default protectedHandler(casaCnpjLookup);
