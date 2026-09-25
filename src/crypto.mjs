import {toBase64} from './domain.mjs?v=0.3.1';
const encoder=new TextEncoder();
export const ITERATIONS=600000;
const aad=encoder.encode('novel-encrypted-v1');
export const randomBytes=n=>crypto.getRandomValues(new Uint8Array(n));
const bytes=s=>{if(typeof s!=='string'||s.length>80*1024*1024)throw Error('密文格式不正确');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
export async function deriveVaultKey(password,salt){
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('密码需为 12–1024 个字符；建议使用长句。');
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(value,key,salt){
  const iv=randomBytes(12),plain=encoder.encode(JSON.stringify(value));
  if(plain.length>40*1024*1024)throw Error('资料库超过 40 MiB，请先导出并整理历史或拆分资料库。');
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain);
  return {format:'novel-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(cipher))};
}
export function inspectEnvelope(value){
  if(value?.format!=='novel-encrypted'||value.version!==1||value.kdf!=='PBKDF2-SHA256'||value.iterations!==ITERATIONS)throw Error('不支持的加密格式');
  const salt=bytes(value.salt),iv=bytes(value.iv),cipher=bytes(value.ciphertext);
  if(salt.length!==16||iv.length!==12||cipher.length<16||cipher.length>40*1024*1024+16)throw Error('密文长度不正确');
  return {salt,iv,cipher};
}
export async function unseal(value,key){const {iv,cipher}=inspectEnvelope(value);try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},key,cipher)));}catch{throw Error('密码不正确，或密文已损坏。原有资料未改动。');}}
export async function encryptBackup(value,password){const salt=randomBytes(16),key=await deriveVaultKey(password,salt);return seal(value,key,salt);}
export async function decryptBackup(value,password){const {salt}=inspectEnvelope(value);return unseal(value,await deriveVaultKey(password,salt));}
