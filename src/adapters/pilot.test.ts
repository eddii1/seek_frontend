import assert from 'node:assert/strict';
import test from 'node:test';
import {reportPhoto,reportSummary,stickPoint} from './pilot';

test('joystick values are finite and constrained to a circular SDK range',()=>{
  assert.deepEqual(stickPoint(1,0),[20,0]);assert.deepEqual(stickPoint(0,-1),[0,20]);
  assert.deepEqual(stickPoint(.02,-.02),[0,0]);
  const [x,y]=stickPoint(9,9);assert.ok(Math.hypot(x,y)<=20.5);
  assert.deepEqual(stickPoint(NaN,1),[0,0]);assert.deepEqual(stickPoint(Infinity,0),[0,0]);
});
test('incident summary distinguishes send attempts, faults and unsequenced acknowledgements',()=>{
  const summary=reportSummary({state:{fault:'Stale operator'},events:[{monotonic:102,event:'fault',reason:'Stale operator'}],wire_events:[
    {monotonic:100,direction:'send',command:'takeoff'}, {monotonic:102,direction:'send',command:'land'},
    {monotonic:102.1,direction:'receive',response:'ok'}, {monotonic:104,direction:'send',command:'land'}]});
  assert.equal(summary.yawSent,false);assert.equal(summary.landAttempts,2);assert.equal(summary.faultSeconds,2);
  assert.ok(Math.abs(summary.firstOkSeconds!-2.1)<1e-6);
});
test('report images can only reference bounded local scan evidence',()=>{
  assert.equal(reportPhoto('/photos/pilot-'+'a'.repeat(32)+'-00.jpg'),'/api/photos/pilot-'+'a'.repeat(32)+'-00.jpg');
  for(const url of ['https://evil.example/p.jpg','/photos/../../.env','javascript:alert(1)','/photos/unknown.jpg'])assert.equal(reportPhoto(url),'');
});
