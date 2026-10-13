export interface InstagramInfo {handle:string;cleanHandle:string;url:string;displayUrl:string;isGenerated:boolean;isVerifiedBrand?:boolean;badgeTitle?:string;}
export function deriveInstagramHandle(_name:string,_company?:string,_isPf=false): string {return '';}
export function resolveInstagram(contact:{name:string;company?:string;category?:string;instagram?:string;entityType?:'pf'|'pj'|'both'}): InstagramInfo {
 const raw=(contact.instagram || '').trim();
 const cleanHandle=raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/^@/,'').replace(/\/.*$/,'');
 const valid=/^[a-zA-Z0-9_.]{1,30}$/.test(cleanHandle);
 return {handle:valid ? `@${cleanHandle}` : '',cleanHandle:valid ? cleanHandle : '',url:valid ? `https://www.instagram.com/${cleanHandle}/` : '',displayUrl:valid ? `instagram.com/${cleanHandle}` : '',isGenerated:false,isVerifiedBrand:false,badgeTitle:'Perfil informado; titularidade não verificada'};
}
