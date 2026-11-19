import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignMonth, normalizeSamplePhone, validateApplication, validateCampaign, processSamplePublic } from '../lib/sample-campaign.mjs';
import { processAdminRequest } from '../lib/order-management.mjs';
const env = { NOVA_ORDER_STORAGE_ENABLED:'true', EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL:'https://sample.example.test', NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY:'server-only-fixture', NOVA_ADMIN_EMAILS:'owner@example.test' };
const now = new Date('2026-11-19T12:00:00Z');
const application = { month:'2026-11',revision:2,name:'Tester QA',phone:'+95 9 123456789',address:'QA address',codes:['NV-001'],acceptedRules:true,requestKey:'sample_qa_123456' };
const json = (data, ok=true) => ({ ok, json:async()=>data });
test('campaign month rolls over at midnight in Yangon',()=>{
 assert.equal(campaignMonth(new Date('2026-11-30T17:29:59Z')),'2026-11');
 assert.equal(campaignMonth(new Date('2026-11-30T17:30:00Z')),'2026-12');
});
test('valid applications normalize phone formats and reject missing consent or invalid codes',()=>{
 assert.equal(normalizeSamplePhone('+95 9 123456789'), '09123456789');
 assert.equal(normalizeSamplePhone('09-123456789'), '09123456789');
 assert.equal(validateApplication(application).name,'Tester QA');
 for(const patch of [{acceptedRules:false},{codes:['NV-033']},{codes:['NV-001','NV-001']},{revision:0},{month:'2026-13'},{name:''},{address:'x'.repeat(501)},{requestKey:'x'},{phone:'abc12345'}]) assert.throws(()=>validateApplication({...application,...patch}));
});
test('monthly campaign validation does not invent eligibility or permit impossible selections',()=>{
 const campaign={month:'2026-11',revision:0,enabled:true,settings:{title:'QA campaign',rules:'QA rules',codes:['NV-001','NV-002'],selectionCount:1,capacity:null}};
 assert.equal(validateCampaign(campaign).settings.capacity,null);
 for(const patch of [{rules:''},{selectionCount:3},{capacity:0},{codes:['NV-001','NV-001']}]) assert.throws(()=>validateCampaign({...campaign,settings:{...campaign.settings,...patch}}));
});
test('public campaign reads only current campaign fields and never application PII',async()=>{
 const urls=[];
 const result=await processSamplePublic({method:'GET'},{env,now,fetchImpl:async url=>{urls.push(url);return json([{month:'2026-11',revision:2,settings:{title:'QA'}}]);}});
 assert.equal(result.status,200);assert.equal(result.body.campaign.month,'2026-11');assert.equal(urls.length,1);
 assert.match(urls[0],/select=month,settings,revision/);assert.match(urls[0],/month=eq.2026-11/);assert.doesNotMatch(urls[0],/applications|phone|address/);
});
test('a valid application calls the atomic RPC and exposes only its receipt',async()=>{
 const calls=[];
 const result=await processSamplePublic({method:'POST',body:application},{env,now,fetchImpl:async(url,options)=>{calls.push({url,options});return json({id:'receipt-id',status:'pending',duplicate:false,phone:'DO NOT EXPOSE',address:'DO NOT EXPOSE'});}});
 assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true,applicationId:'receipt-id',status:'pending',duplicate:false});
 assert.match(calls[0].url,/rpc\/create_nova_sample_application$/);
 const body=JSON.parse(calls[0].options.body);assert.equal(body.p_phone,'09123456789');assert.equal(body.p_revision,2);assert.equal(body.p_request_key,application.requestKey);
});
test('closed, stale, quota and duplicate database guards produce a safe non-success response',async()=>{
 for(const code of ['CAMPAIGN_CHANGED','CAMPAIGN_CLOSED','CAMPAIGN_FULL','ALREADY_APPLIED','REQUEST_CONFLICT','INVALID_SELECTION']){
  const result=await processSamplePublic({method:'POST',body:application},{env,now,fetchImpl:async()=>json({message:code},false)});
  assert.equal(result.status,409);assert.equal(result.body.ok,undefined);
 }
 const unavailable=await processSamplePublic({method:'GET'},{env,now,fetchImpl:async()=>json({message:'relation does not exist'},false)});
 assert.equal(unavailable.status,503);assert.doesNotMatch(unavailable.body.error,/relation/);
});
test('past months and malformed submissions fail before writes',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return json({});};
 assert.equal((await processSamplePublic({method:'POST',body:{...application,month:'2026-10'}},{env,now,fetchImpl})).status,409);
 assert.equal((await processSamplePublic({method:'POST',body:{...application,acceptedRules:false}},{env,now,fetchImpl})).status,400);
 assert.equal(calls,0);
});
test('campaign administration reuses the staff allowlist and does not grant customers access',async()=>{
 for(const headers of [{},{authorization:'Bearer customer'}]){
  const calls=[];
  const result=await processAdminRequest({method:'GET',url:'/api/admin/media?view=samples',headers},{resource:'media',env,fetchImpl:async url=>{calls.push(url);return json({id:'customer',email:'customer@example.test'});}});
  assert.ok([401,403].includes(result.status));assert.equal(calls.some(url=>url.includes('/rest/')),false);
 }
});
