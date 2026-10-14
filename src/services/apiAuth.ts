import {auth} from '../lib/firebase';
export async function apiHeaders(): Promise<Record<string,string>> {
 const user=auth.currentUser;
 if(!user)throw new Error('Entre no aplicativo para executar a coleta.');
 return {'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`};
}
