import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, prepareProfileImage, prepareBoardImage } from '../lib/profile-image.mjs';
test('profile fitting preserves ratio, never crops or upscales', () => {
  assert.deepEqual(fitWithin(4000,2000,1080), {width:1080,height:540});
  assert.deepEqual(fitWithin(2000,4000,1080), {width:540,height:1080});
  assert.deepEqual(fitWithin(400,300,1080), {width:400,height:300});
  assert.throws(() => fitWithin(0,100,1080));
});
function fixture({ type='image/png', sizes=[300000], fail=false }={}) {
  const calls=[];let revoked=0;let n=0;
  const img={naturalWidth:1254,naturalHeight:1254,set src(value){queueMicrotask(()=>fail?this.onerror():this.onload());}};
  const canvas={width:0,height:0,getContext:()=>({drawImage:(...args)=>calls.push(args.slice(1))}),toBlob:(cb,mime)=>cb({size:sizes[Math.min(n++,sizes.length-1)],type:mime})};
  return {blob:{type},calls,canvas,doc:{createElement:tag=>tag==='img'?img:canvas},urls:{createObjectURL:()=> 'blob:qa',revokeObjectURL:()=>revoked++},get revoked(){return revoked;}};
}
test('PNG remains transparent-capable and exceeds neither 1080px nor 1MiB',async()=>{
  const f=fixture();const r=await prepareProfileImage(f.blob,f);
  assert.equal(r.blob.type,'image/png');assert.equal(r.width,1080);assert.ok(r.blob.size<=1024*1024);assert.equal(f.revoked,1);assert.equal(f.canvas.width,0);
});
test('large JPEG retries smaller dimensions until safely below upload cap',async()=>{
  const f=fixture({type:'image/jpeg',sizes:[2500000,1800000,400000]});const r=await prepareProfileImage(f.blob,f);
  assert.equal(r.width,720);assert.equal(r.blob.type,'image/jpeg');assert.equal(f.calls.length,3);
});
test('decode/encoding failures clean up temporary objects and do not yield an upload',async()=>{
  const f=fixture({fail:true});await assert.rejects(prepareProfileImage(f.blob,f));assert.equal(f.revoked,1);
  const g=fixture({sizes:[2500000]});await assert.rejects(prepareProfileImage(g.blob,g));assert.equal(g.revoked,1);
});

test('board accepts a large source and retries within the server upload cap', async () => {
  const f = fixture({ type: 'image/jpeg', sizes: [4000000, 2500000, 1800000] });
  const result = await prepareBoardImage(f.blob, f);
  assert.equal(result.width, 1254); // Original image never upscaled.
  assert.equal(result.blob.size, 1800000);
  assert.equal(f.calls.length, 3);
  assert.equal(f.revoked, 1);
});
test('board preserves transparent PNGs and refuses files still too large after all retries', async () => {
  const f = fixture({ sizes: [1500000] });
  const result = await prepareBoardImage(f.blob, f);
  assert.equal(result.blob.type, 'image/png');
  const g = fixture({ sizes: [3000000] });
  await assert.rejects(prepareBoardImage(g.blob, g));
  assert.equal(g.calls.length, 7);
  assert.equal(g.revoked, 1);
});
