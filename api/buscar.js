import {protectedHandler} from '../src/server/serverAuth.js';
import {  cnpjLookup } from '../src/server/verifiedSearch.js';
export default protectedHandler(async body => {
 const lead = await cnpjLookup(body.query || '');
 return { ...lead, nome_empresa: lead.name, endereco: lead.location, telefone_publico: lead.phone };
});
