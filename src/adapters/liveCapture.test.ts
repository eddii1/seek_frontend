import test from 'node:test';
import assert from 'node:assert/strict';
import {api,photoUrl,savedCaptureId,type CaptureJob} from './liveCapture';

test('backend validation errors remain actionable rather than becoming fake capture success',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:'No fresh camera frame.'}),{status:503});
  try {await assert.rejects(api('/captures',{method:'POST'}),/No fresh camera frame/);} finally {globalThis.fetch=original;}
});
test('non-JSON proxy failures produce a useful backend error',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('proxy unavailable',{status:502});
  try {await assert.rejects(api('/health'),/502/);} finally {globalThis.fetch=original;}
});
test('capture request and cancellation use the same-origin backend proxy',async()=>{
  const original=globalThis.fetch;
  const requests:{url:string;method:string|undefined}[]=[];
  globalThis.fetch=async(input,init)=>{requests.push({url:String(input),method:init?.method});return new Response('{}',{status:200});};
  try {await api('/captures',{method:'POST'});await api('/captures/abc/cancel',{method:'POST'});
    assert.deepEqual(requests,[{url:'/api/captures',method:'POST'},{url:'/api/captures/abc/cancel',method:'POST'}]);
  } finally {globalThis.fetch=original;}
});
test('only saved local capture images may be embedded',()=>{
  const job={photo_url:'/photos/a12f.jpg'} as CaptureJob;
  assert.equal(photoUrl(job),'/api/photos/a12f.jpg');
  for(const invalid of ['https://third-party.example/image.jpg','javascript:alert(1)','/photos/../../.env','/photos/name.svg']) {
    assert.throws(()=>photoUrl({...job,photo_url:invalid}),/Invalid capture image URL/);
  }
});
test('only real capture IDs are restored from dashboard links',()=>{
  assert.equal(savedCaptureId('?capture=912695c49a6644da859bddcfb1516926'),'912695c49a6644da859bddcfb1516926');
  assert.equal(savedCaptureId('?capture=../../.env'),null);
  assert.equal(savedCaptureId('?capture=https://example.com'),null);
  assert.equal(savedCaptureId(''),null);
});
