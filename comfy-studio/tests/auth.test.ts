import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, verifySession, checkPassword, getAuthConfig, authDecision, LoginLimiter, loginURL } from '../lib/auth.ts';
const secret='a'.repeat(64);
const config={password:'only-a-test-password',secret};
test('login redirect preserves the public host behind a loopback reverse proxy',()=>{
  assert.equal(loginURL(new Headers({host:'ai.koharu-market.com','x-forwarded-proto':'https'})), 'https://ai.koharu-market.com/login');
  assert.equal(loginURL(new Headers({host:'127.0.0.1:3002'})), 'http://127.0.0.1:3002/login');
  assert.equal(loginURL(new Headers({host:'evil.example'})), null);
});
test('password configuration fails closed when missing or weakly configured',()=>{
  assert.equal(getAuthConfig({}),null);
  assert.equal(getAuthConfig({STUDIO_PASSWORD:'',STUDIO_SESSION_SECRET:secret}),null);
  assert.equal(getAuthConfig({STUDIO_PASSWORD:'long-enough',STUDIO_SESSION_SECRET:'short'}),null);
  assert.deepEqual(getAuthConfig({STUDIO_PASSWORD:'long-enough',STUDIO_SESSION_SECRET:secret}),{password:'long-enough',secret});
});
test('password comparison accepts only the exact configured value',()=>{
  assert.equal(checkPassword('only-a-test-password',config),true);
  assert.equal(checkPassword('wrong',config),false);
  assert.equal(checkPassword(' only-a-test-password',config),false);
  assert.equal(checkPassword('',config),false);
});
test('sessions expire, reject tampering and stop working after a password rotation',()=>{
  const session=createSession(config,1000);
  assert.equal(verifySession(session,config,1001),true);
  assert.equal(verifySession(session,config,1000+8*60*60*1000),false);
  assert.equal(verifySession(session+'x',config,1001),false);
  assert.equal(verifySession(session,{...config,password:'another-password'},1001),false);
  assert.equal(verifySession('malformed',config,1001),false);
});
test('all generation APIs and private images require a session, including when auth is not configured',()=>{
  for(const pathname of ['/','/api/models','/api/generations','/api/generations/abc/image','/inspiration/neon-rain.png']){
    assert.notEqual(authDecision(pathname,false,false),'allow');
    assert.notEqual(authDecision(pathname,false,true),'allow');
    assert.equal(authDecision(pathname,true,true),'allow');
  }
  assert.equal(authDecision('/api/models',false,true),'unauthorized');
  assert.equal(authDecision('/',false,true),'login');
  assert.equal(authDecision('/login',false,false),'allow');
  assert.equal(authDecision('/api/auth/login',false,false),'allow');
});
test('repeated failed login attempts are throttled and recover after the time window',()=>{
  const limiter=new LoginLimiter();
  for(let i=0;i<5;i++){assert.equal(limiter.allowed('ip',1000),true);limiter.failure('ip',1000);}
  assert.equal(limiter.allowed('ip',1001),false);
  assert.equal(limiter.allowed('other',1001),true);
  assert.equal(limiter.allowed('ip',1000+15*60*1000),true);
});
