import {protectedHandler} from '../src/server/serverAuth.js';
import {  extractWebsite } from '../src/server/verifiedSearch.js';
export default protectedHandler(extractWebsite);
