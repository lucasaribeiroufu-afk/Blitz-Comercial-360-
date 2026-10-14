import {protectedHandler} from '../src/server/serverAuth.js';
import {startBuyerRadar} from '../src/server/buyerRadar.js';
export default protectedHandler(startBuyerRadar);
