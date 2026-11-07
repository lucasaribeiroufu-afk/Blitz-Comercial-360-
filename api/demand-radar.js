import { protectedHandler } from "../src/server/serverAuth.js";
import { startBuyerRadar } from "../src/server/buyerRadar.js";

export default protectedHandler((body, deps) =>
  startBuyerRadar({ ...body, includeMarketplaces: false }, { ...deps, freeOnly: true }),
);
