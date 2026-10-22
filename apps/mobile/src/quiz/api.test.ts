import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, type ApiClient } from '../auth/http-client';
import { createQuizApi } from './api';
import { createGuestQuizClient } from './guest-transport';

const identity = {sessionId:'s1',participantId:'p1',participantToken:'private-token',roomCode:'H7UZT3',displayName:'نورة'};
for (const status of [403,404,429]) {
  test('join handles HTTP '+status+' without displaying internal server text', async () => {
    const api = createQuizApi((async () => { throw new ApiError('private internal URL',status); }) as ApiClient['request']);
    const result = await api.requestJoin('H7UZT3','نورة');
    assert.equal(result.ok,false);
    if (!result.ok) assert.ok(!result.message.includes('private'));
  });
}
for (const operation of ['snapshot','answer'] as const) {
  for (const status of [401,403,404,429]) {
    test(operation+' safely handles HTTP '+status, async () => {
      const api = createQuizApi((async () => { throw new ApiError('private internal URL',status); }) as ApiClient['request']);
      const {result} = await api.postRoom(identity,operation,{questionId:'q1',optionId:'o1'});
      assert.equal(result.ok,false);
      if (!result.ok) {
        assert.equal(result.fatal,status===401||status===404);
        assert.ok(!result.message.includes('private'));
      }
    });
  }
}
test('quiz transport rejects redirects, ignores cookies and never installs an account sign-out handler', async () => {
  let calls=0;
  const client=createGuestQuizClient('https://qurabia.com',async(url,init)=>{
    calls++;
    assert.equal(init.headers.Cookie,undefined);
    assert.equal(init.credentials,'omit');
    assert.equal(init.redirect,'error');
    assert.equal(url,'https://qurabia.com/api/live/s1/room/');
    return { status:calls===2?401:200,url,headers:{get:()=> 'next-auth.session-token=should-not-be-stored; Path=/; Secure'},
      rawSetCookies:['next-auth.session-token=should-not-be-stored; Path=/; Secure'],
      text:async()=>JSON.stringify(calls===2?{error:'UNAUTHORIZED'}:{ok:true}) };
  });
  assert.deepEqual(await client.request('/api/live/s1/room',{method:'POST',body:{accessToken:'private-token'}}),{ok:true});
  await assert.rejects(()=>client.request('/api/live/s1/room',{method:'POST',body:{accessToken:'private-token'}}),error=>error instanceof ApiError&&error.status===401);
  assert.equal(client.sessionGeneration,0);
  assert.deepEqual(await client.request('/api/live/s1/room',{method:'POST',body:{}}),{ok:true});
});

test('answer rejection keeps the safe server reason through the shared HTTP client', async () => {
  const client=createGuestQuizClient('https://qurabia.com',async(url)=>({
    status:409,url,headers:{get:()=>null},text:async()=>JSON.stringify({ok:false,reason:'ANSWER_TOO_LATE'}),
  }));
  const {result}=await createQuizApi(client.request).postRoom(identity,'answer',{questionId:'q1',optionId:'o1'});
  assert.deepEqual(result,{ok:false,fatal:false,message:'وصلت الإجابة بعد انتهاء الوقت.'});
});
test('unknown answer reasons never become displayed server text or prototype values', async () => {
  const client=createGuestQuizClient('https://qurabia.com',async(url)=>({
    status:409,url,headers:{get:()=>null},text:async()=>JSON.stringify({ok:false,reason:'toString',error:'private server detail'}),
  }));
  const {result}=await createQuizApi(client.request).postRoom(identity,'answer',{questionId:'q1',optionId:'o1'});
  assert.equal(result.ok,false);
  if(!result.ok){assert.equal(typeof result.message,'string');assert.ok(!result.message.includes('private'));}
});
