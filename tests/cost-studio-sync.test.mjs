import test from 'node:test';
import assert from 'node:assert/strict';
import { costStudioSync } from '../lib/cost-studio-sync.mjs';

test('two devices share one ledger and stale writes cannot replace newer entries', async () => {
  const email='test@example.invalid';
  let row;
  const fetchImpl=async (url,options) => {
    const body=options.body && JSON.parse(options.body);
    const query=new URL(url).searchParams;
    if(options.method!=='POST') assert.equal(query.get('owner_email'),'eq.'+email);
    if(options.method==='POST') {
      if(row)return Response.json({}, {status:409});
      assert.equal(body.owner_email,email);
      row=body;
    }
    if(options.method==='PATCH'){
      if(query.get('revision')!=='eq.'+row.revision)return Response.json([]);
      row={...row,...body};
    }
    return Response.json(row?[row]:[]);
  };
  const call=(method,body)=>costStudioSync({method,body},{baseUrl:'https://preview.test',email,serviceKey:'fixture',fetchImpl});
  const ledger={entries:[{kind:'expense',id:'fixture'}],refs:[1300,200,9000,17000,15000,35000],checks:{}};
  assert.equal((await call('GET')).body.revision,0);
  assert.equal((await call('POST',{revision:0,ledger})).status,200);
  assert.equal((await call('POST',{revision:0,ledger})).status,409);
  assert.deepEqual((await call('GET')).body.ledger,ledger);
  assert.equal((await call('POST',{revision:1,ledger})).status,200);
  assert.equal((await call('POST',{revision:1,ledger})).status,409);
});
