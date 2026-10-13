import {protectedHandler} from '../src/server/serverAuth.js';
import {searchBuyers} from '../src/server/verifiedSearch.js';
import {startSocialRadar} from '../src/server/socialRadar.js';
export default protectedHandler((body,deps) => process.env.APIFY_API_TOKEN ? startSocialRadar(body,deps) : searchBuyers(body,deps));
