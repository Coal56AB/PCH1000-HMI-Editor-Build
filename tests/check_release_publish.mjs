import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import publish from '../scripts/publish_release.cjs';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pch-publish-'));
const sha='a'.repeat(40),tag='v1.2.6';
const names=['PCH1000_HMI_Editor_v1.2.6.apk','PCH1000_HMI_Editor_v1.2.6_full.zip','release-metadata.json'];
fs.writeFileSync(path.join(directory,names[0]),'test apk');
fs.writeFileSync(path.join(directory,names[1]),'test sources');
fs.writeFileSync(path.join(directory,names[2]),JSON.stringify({versionName:'1.2.6',versionCode:9,sourceSha:sha}));
fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'),names.map(name=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')}  ${name}\n`).join(''));
function fixture({newer=false,foreignTag=false,failUpload=false}={}){
 const releases=newer?[{id:5,tag_name:'v1.2.7',draft:false,prerelease:false}]:[],assets=[],writes=[];
 let ref=foreignTag?{object:{type:'commit',sha:'b'.repeat(40)}}:null,failed=false;
 const missing=()=>{throw Object.assign(Error('Not Found'),{status:404})};
 const repos={
  listReleases:'releases',listReleaseAssets:'assets',
  async createRelease(args){writes.push('create');const r={...args,id:10};releases.push(r);return{data:r}},
  async deleteReleaseAsset(args){writes.push('delete');assets.splice(assets.findIndex(a=>a.id===args.asset_id),1)},
  async uploadReleaseAsset(args){
   writes.push('upload');if(failUpload&&!failed&&assets.length===2){failed=true;throw Error('upload interrupted')}
   assets.push({id:100+assets.length,name:args.name});return{data:{}};
  },
  async updateRelease(args){
   assert.equal(assets.length,4,'Do not publish before all assets upload');writes.push('publish');
   const r=releases.find(r=>r.id===args.release_id);Object.assign(r,args);ref={object:{type:'commit',sha}};return{data:r};
  }
 };
 const github={rest:{repos,git:{getRef:async()=>ref?{data:ref}:missing()}},
  paginate:async method=>method==='releases'?releases:assets.slice()};
 return{releases,assets,writes,run:()=>publish({github,context:{repo:{owner:'test',repo:'app'},sha},core:{info(){}},directory})};
}
try{
 const f=fixture();await f.run();assert.equal(f.releases[0].make_latest,'true');
 assert.deepEqual(new Set(f.assets.map(a=>a.name)),new Set([...names,'SHA256SUMS.txt']));
 const writes=f.writes.length;await f.run();assert.equal(f.writes.length,writes,'Published release rerun must not change assets');
 const older=fixture({newer:true});await older.run();assert.equal(older.releases.at(-1).make_latest,'false','Old build must not downgrade latest');
 const retry=fixture({failUpload:true});await assert.rejects(retry.run(),/upload interrupted/);
 assert.equal(retry.releases[0].draft,true);await retry.run();assert.equal(retry.releases.length,1);assert.equal(retry.releases[0].draft,false);
 const foreign=fixture({foreignTag:true});await assert.rejects(foreign.run(),/different commit/);assert.equal(foreign.writes.length,0);
 fs.appendFileSync(path.join(directory,names[0]),'corruption');
 const corrupt=fixture();await assert.rejects(corrupt.run(),/checksum mismatch/);assert.equal(corrupt.writes.length,0);
 console.log('PASS: complete publication, rerun without overwrite, interrupted draft recovery, latest downgrade prevention, foreign tag and damaged artifact rejection');
}finally{fs.rmSync(directory,{recursive:true,force:true})}
