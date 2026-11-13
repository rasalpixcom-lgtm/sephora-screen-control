import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {build} from "esbuild";
import sharp from "sharp";
const runtime=path.resolve(".server-runtime");await fs.mkdir(runtime,{recursive:true});
const output=path.join(runtime,"client-photo-storage.cjs");
await build({stdin:{contents:'export {privatePhotoStorage} from "./lib/private-photo-storage"; export {prepareScreenPhoto,readScreenPhoto,removeScreenPhoto} from "./lib/screen-photo"; export {prepareLocationPhoto,readLocationPhoto,removeLocationPhoto} from "./lib/location-photo";',resolveDir:process.cwd(),loader:"ts"},outfile:output,bundle:true,platform:"node",format:"cjs",external:["sharp"]});
const require=createRequire(import.meta.url),lib=require(output);
const cryptoModule=require("node:crypto"),fsModule=require("node:fs/promises");
const directory=await fs.mkdtemp(path.join(runtime,"client-photo-unit-")),cwd=process.cwd();
const previous=[process.env.SCREEN_PHOTO_DIR,process.env.LOCATION_PHOTO_DIR];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log("PASS "+label);};
const rejected=async(work,label,predicate=()=>true)=>{await assert.rejects(work,predicate,label);checks++;console.log("PASS "+label);};
try{
 const image=await sharp({create:{width:80,height:120,channels:3,background:"#206e57"}}).png().toBuffer();
 const file=new File([image],"ignored-name.png",{type:"image/png"});
 for(const kind of ["screen","location"]){
  const root=path.join(directory,kind);await fs.mkdir(root);const setting=kind==="screen"?"SCREEN_PHOTO_DIR":"LOCATION_PHOTO_DIR";process.env[setting]=root;
  const own=lib.privatePhotoStorage(kind,"sephora"),other=lib.privatePhotoStorage(kind,"other");
  const old=randomUUID();await fs.writeFile(path.join(root,old+".webp"),"legacy-full");await fs.writeFile(path.join(root,old+"-thumb.webp"),"legacy-thumb");
  for(const small of [false,true]){
   check((await own.read(old,small)).toString()===(small?"legacy-thumb":"legacy-full"),kind+": existing Sephora "+(small?"thumbnail":"full")+" unchanged");
   await rejected(()=>other.read(old,small),kind+": other workspace cannot use Sephora legacy fallback",e=>e.code==="ENOENT");
  }
  await other.remove(old);check((await own.read(old,false)).toString()==="legacy-full",kind+": foreign cleanup leaves legacy Sephora file untouched");
  const a=await own.save(Buffer.from("own-full"),Buffer.from("own-thumb")),b=await other.save(Buffer.from("foreign-full"),Buffer.from("foreign-thumb"));
  check((await fs.readFile(path.join(root,"clients/client-sephora",a+".webp"))).toString()==="own-full",kind+": own write uses client folder");
  check((await fs.readFile(path.join(root,"clients/client-other",b+".webp"))).toString()==="foreign-full",kind+": foreign write uses separate folder");
  await rejected(()=>own.read(b,false),kind+": known foreign key cannot cross workspace",e=>e.code==="ENOENT");
  await rejected(()=>other.read(a,true),kind+": known own thumbnail key cannot cross workspace",e=>e.code==="ENOENT");
  // Same key in different clients must still return each client's own bytes.
  await fs.writeFile(path.join(root,"clients/client-other",a+".webp"),"same-key-foreign");
  check((await own.read(a,false)).toString()==="own-full"&&(await other.read(a,false)).toString()==="same-key-foreign",kind+": identical keys are isolated by workspace");
  // A staged upload can share a UUID with a legacy flat file. Rejecting that
  // upload must not revoke the existing legacy photo's bytes.
  const originalUuid=cryptoModule.randomUUID;
  try{
   cryptoModule.randomUUID=()=>old;
   await own.save(Buffer.from("staged-full"),Buffer.from("staged-thumb"));
   await own.discard(old);
   check((await own.read(old,false)).toString()==="legacy-full"&&(await own.read(old,true)).toString()==="legacy-thumb",kind+": rejected namespaced upload cannot delete colliding legacy pair");
  }finally{cryptoModule.randomUUID=originalUuid;}
  await other.discard(old);check((await own.read(old,false)).toString()==="legacy-full",kind+": foreign staged cleanup cannot delete legacy files");
  try{
   cryptoModule.randomUUID=()=>a;
   await rejected(()=>own.save(Buffer.from("collision"),Buffer.from("collision")),kind+": duplicate full file fails without overwriting");
   check((await own.read(a,false)).toString()==="own-full"&&(await own.read(a,true)).toString()==="own-thumb",kind+": failed collision leaves original pair unchanged");
   const thumbKey=originalUuid();cryptoModule.randomUUID=()=>thumbKey;
   await fs.writeFile(path.join(root,"clients/client-sephora",thumbKey+"-thumb.webp"),"pre-existing-thumb");
   await rejected(()=>own.save(Buffer.from("new-full"),Buffer.from("new-thumb")),kind+": thumbnail collision fails closed");
   check(!(await fs.readdir(path.join(root,"clients/client-sephora"))).includes(thumbKey+".webp")&&(await own.read(thumbKey,true)).toString()==="pre-existing-thumb",kind+": partial upload cleaned without deleting existing thumbnail");
   const failedKey=originalUuid(),originalOpen=fsModule.open;cryptoModule.randomUUID=()=>failedKey;
   try{
    fsModule.open=async(file,...args)=>{if(String(file).endsWith(failedKey+"-thumb.webp"))throw Object.assign(new Error("Simulated write failure"),{code:"EACCES"});return originalOpen(file,...args);};
    await rejected(()=>own.save(Buffer.from("partial-full"),Buffer.from("partial-thumb")),kind+": filesystem upload failure returned");
   }finally{fsModule.open=originalOpen;}
   check(!(await fs.readdir(path.join(root,"clients/client-sephora"))).some(n=>n.startsWith(failedKey)),kind+": failed second write leaves no partial photo");
   const concurrentKey=originalUuid();cryptoModule.randomUUID=()=>concurrentKey;
   const attempts=await Promise.allSettled([own.save(Buffer.from("concurrent"),Buffer.from("concurrent-thumb")),own.save(Buffer.from("concurrent"),Buffer.from("concurrent-thumb"))]);
   check(attempts.filter(r=>r.status==="fulfilled").length===1&&(await own.read(concurrentKey,false)).toString()==="concurrent"&&(await own.read(concurrentKey,true)).toString()==="concurrent-thumb",kind+": simultaneous key collision preserves the successful upload");
  }finally{cryptoModule.randomUUID=originalUuid;}
  await own.remove(a);await own.remove(a);check((await other.read(a,false)).toString()==="same-key-foreign",kind+": repeated own removal cannot delete foreign same-key file");
  await own.remove(b);check((await other.read(b,false)).toString()==="foreign-full",kind+": own cleanup cannot delete foreign-only file");
  await own.remove(old);await rejected(()=>own.read(old,false),kind+": old authorized removal cleans flat full and thumbnail",e=>e.code==="ENOENT");
  check(!(await fs.readdir(root)).some(n=>n.endsWith(".webp")),kind+": flat legacy pair removed together");
  for(const bad of ["../secret","/absolute","C:\\private","a".repeat(36)])await rejected(()=>own.read(bad,false),kind+": invalid photo key rejected",e=>e.status===400);
  // Filesystem links are never followed, even when another client's file exists.
  const linkKey=randomUUID(),target=path.join(root,"clients/client-other",b+".webp"),link=path.join(root,"clients/client-sephora",linkKey+".webp");
  await fs.link(target,link);
  await rejected(()=>own.read(linkKey,false),kind+": hard-linked foreign file cannot be read");
  await rejected(()=>own.remove(linkKey),kind+": hard-linked foreign file cannot be deleted");await fs.unlink(link);
  const unsafeRoot=path.join(directory,kind+"-junction");await fs.mkdir(unsafeRoot);await fs.mkdir(path.join(unsafeRoot,"clients"));
  await fs.symlink(path.join(root,"clients/client-other"),path.join(unsafeRoot,"clients/client-sephora"),"junction");process.env[setting]=unsafeRoot;
  await rejected(()=>own.read(b,false),kind+": client directory junction cannot cross workspace");
  await rejected(()=>own.save(Buffer.from("x"),Buffer.from("y")),kind+": client directory junction cannot receive uploads");
  await rejected(()=>own.remove(b),kind+": client directory junction cannot delete foreign file");
  await fs.unlink(path.join(unsafeRoot,"clients/client-sephora"));process.env[setting]=root;
  check((await other.read(b,false)).toString()==="foreign-full",kind+": link attacks leave original bytes unchanged");
  process.env[setting]="relative/photos";await rejected(()=>own.read(old,false),kind+": relative configured storage rejected");process.env[setting]=root;
  const prepare=kind==="screen"?lib.prepareScreenPhoto:lib.prepareLocationPhoto,read=kind==="screen"?lib.readScreenPhoto:lib.readLocationPhoto,remove=kind==="screen"?lib.removeScreenPhoto:lib.removeLocationPhoto;
  const key=await prepare(file);check((await sharp(await read(key,false)).metadata()).format==="webp",kind+": application wrapper normalizes and reads private photo");
  check((await sharp(await read(key,true)).metadata()).width===80,kind+": wrapper thumbnail still readable");await remove(key);
  // Default paths stay durable when standalone changes its working directory.
  delete process.env[setting];const standalone=path.join(directory,"default-"+kind,".next/standalone");await fs.mkdir(standalone,{recursive:true});process.chdir(standalone);
  const saved=await prepare(file);check((await fs.stat(path.join(directory,"default-"+kind,"uploads",kind+"-photos/clients/client-sephora",saved+".webp"))).isFile(),kind+": standalone path stays outside build");await remove(saved);process.chdir(cwd);process.env[setting]=root;
 }
 for(const client of [null, undefined, 123, {}, "", ".", "..", "../other", "SEPHORA", "other/child", "other\\child", "a".repeat(65)]){assert.throws(()=>lib.privatePhotoStorage("screen",client));checks++;}
 assert.throws(()=>lib.privatePhotoStorage("../screen","sephora"));checks++;
 console.log(checks+" client photo storage checks passed.");
}finally{
 process.chdir(cwd);for(const [i,setting] of ["SCREEN_PHOTO_DIR","LOCATION_PHOTO_DIR"].entries()){if(previous[i]===undefined)delete process.env[setting];else process.env[setting]=previous[i];}
 const resolved=path.resolve(directory);if(!resolved.startsWith(runtime+path.sep)||!path.basename(resolved).startsWith("client-photo-unit-"))throw new Error("Unsafe test cleanup");
 await fs.rm(resolved,{recursive:true,force:true});
}
