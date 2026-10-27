import {protectedHandler} from '../src/server/serverAuth.js';
import {  searchBusinesses } from '../src/server/verifiedSearch.js';
export default protectedHandler(searchBusinesses);
