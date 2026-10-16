// Explicit opt-in: uses a disposable Auth account, removed in finally. Sends no email, Telegram or push.
// Start a local backend with BACKGROUND_JOBS_ENABLED=false and TELEGRAM_BOT_POLLING_ENABLED=false.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('node:fs');
async function main() {
  if (process.env.RUN_INTEGRATION_TESTS !== 'true') throw Error('Set RUN_INTEGRATION_TESTS=true to run the isolated integration flow');
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const env = readFileSync('../frontend/.env.local','utf8');
  const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
  assert.ok(anon,'Missing frontend anon key');
  const client = createClient(process.env.SUPABASE_URL,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const email='integrity-'+randomUUID()+'@example.invalid', password=randomUUID()+randomUUID();
  let id;
  try {
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Temporary integrity test'}});
    assert.ifError(created.error); id=created.data.user.id;
    const login=await client.auth.signInWithPassword({email,password}); assert.ifError(login.error);
    const token=login.data.session.access_token;
    const call=async(path,method='GET',body,auth=true)=>{
      const response=await fetch('http://localhost:3001'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(100000)});
      const text=await response.text();
      console.log(method,path,response.status);
      return {status:response.status,data:text?JSON.parse(text):null};
    };
    const own=await client.from('profiles').select('id'); assert.ifError(own.error); assert.deepEqual(own.data.map(p=>p.id),[id]);
    assert.equal((await call('/watchlist','GET',undefined,false)).status,401);
    assert.equal((await call('/monitoring/sync','POST')).status,403);
    assert.equal((await call('/monitoring/scheduled','POST',undefined,false)).status,403);
    assert.equal((await call('/companies/bad','GET',undefined,false)).status,400);
    assert.equal((await call('/watchlist','POST',{ico:'50847902'})).status,201);
    assert.equal((await call('/watchlist','POST',{ico:'50847902'})).status,409);
    let list=await call('/watchlist'); assert.equal(list.data.length,1); assert.equal(list.data[0].companies.ico,'50847902');
    const foreign=await client.from('watchlists').select('user_id');assert.ifError(foreign.error);assert.ok(foreign.data.every(w=>w.user_id===id));
    assert.equal((await call('/watchlist/50847902','PATCH',{alias:'Fixture',notify_telegram:false,notify_push:false})).status,200);
    list=await call('/watchlist');assert.equal(list.data[0].alias,'Fixture');
    assert.equal((await call('/notifications/push/subscribe','POST',{subscription:{endpoint:'http://127.0.0.1/internal',keys:{}}})).status,400);
    assert.equal((await call('/notifications/alerts')).status,200);
    assert.equal((await call('/notifications/alerts/read-all','POST')).status,201);
    assert.equal((await call('/watchlist/50847902','DELETE')).status,204);
    assert.equal((await call('/watchlist')).data.length,0);
    console.log('PASS: Auth, profile creation, RLS isolation, private/admin guards, watchlist add/update/remove, duplicate prevention, alert reads, unsafe push rejection');
  } finally {
    if(id){const result=await admin.auth.admin.deleteUser(id);assert.ifError(result.error);console.log('Disposable test account and dependent records removed');}
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
