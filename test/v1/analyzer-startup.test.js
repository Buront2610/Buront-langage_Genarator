'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PythonClient}=require('../../dist/packages/runtime/python-client');

test('cancellation releases a request even while analyzer startup has not returned a ready frame', {timeout:2000}, async()=>{
  const client=new PythonClient(), controller=new AbortController();
  client.start=()=>new Promise(()=>{});
  const waiting=client.analyze('起動待ち。',Date.now()+10000,controller.signal);
  controller.abort();
  await assert.rejects(waiting,/CANCELLED/);client.close();
});

test('request deadline covers analyzer startup, and already-cancelled requests do not start it', {timeout:2000}, async()=>{
  const client=new PythonClient();let starts=0;
  client.start=()=>{starts++;return new Promise(()=>{})};
  await assert.rejects(client.analyze('期限。',Date.now()+25),/DEADLINE_EXCEEDED/);
  assert.equal(starts,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(client.analyze('取消済。',Date.now()+1000,controller.signal),/CANCELLED/);
  assert.equal(starts,1);client.close();
});
