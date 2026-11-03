const assert = require('node:assert/strict');
const {call,ok,rows,advance,setPassword,metrics,time}=require('./backend-fixture.cjs');
(async () => {
  const before={...metrics};
  assert.equal((await call('alice', { action: 'access', password: '' })).status, 403);
  assert.equal((await call('alice', { action: 'create', variant: 0, password: 'wrong' })).status, 403);
  await ok('alice', { action: 'access' });
  assert.equal(metrics.authCalls,before.authCalls,'password checks must not call Auth');assert.equal(metrics.clients,before.clients,'password checks must not create a database client');
  assert.equal((await call('alice',{action:'access',password:'x'.repeat(5000)})).status,413);assert.equal(metrics.clients,before.clients);
  setPassword('rotated');
  assert.equal((await call('alice', { action: 'access' })).status, 403);
  await ok('alice', { action: 'access', password: 'rotated' });
  setPassword('');
  assert.equal((await call('alice', { action: 'access', password: '' })).status, 403);
  setPassword('test-password');
  assert.equal((await call('bad', { action: 'create',variant:0 })).status, 401);
  const a = await ok('alice', { action: 'create', variant: 5, name: 'Alice' });
  assert.equal((await call('eve', { action: 'state', code: a.code })).status, 400);
  const b = await ok('bob', { action: 'join', code: a.code, name: 'Bob' });
  assert.equal((await call('bob', { action: 'start', code: a.code, version: b.version })).status, 400);
  const start = await ok('alice', { action: 'start', code: a.code, version: b.version });
  assert(!('deck' in start.game));
  assert(start.game.players[1].cards.every(c => c === -1));
  const bob = await ok('bob', { action: 'state', code: a.code });
  assert(bob.game.players[0].cards.every(c => c === -1));
  const actor = bob.game.turn === 0 ? 'alice' : 'bob', other = actor === 'alice' ? 'bob' : 'alice';
  assert.equal((await call(other, { action: 'act', code: a.code, version: bob.version, move: 'call' })).status, 400);
  await ok(actor, { action: 'act', code: a.code, version: bob.version, move: 'call' });
  assert.equal((await call(actor, { action: 'act', code: a.code, version: bob.version, move: 'call' })).status, 409);
  for (let variant = 0; variant < 6; variant++) {
    const host = 'host' + variant, guest = 'guest' + variant;
    const room = await ok(host, { action: 'create', variant });
    const join = await ok(guest, { action: 'join', code: room.code });
    let state = await ok(host, { action: 'start', code: room.code, version: join.version });
    let moves = 0;
    while (!state.game.finished && moves++ < 100) state = await ok(state.game.turn === 0 ? host : guest, { action: 'act', code: room.code, version: state.version, move: 'call' });
    assert(state.game.finished);
    assert.equal(state.game.players.reduce((sum, p) => sum + p.stack, 0), 2000);
    advance(6000);
    state = await ok(host, { action: 'state', code: room.code });
    assert.equal(state.game.hand, 2, 'automatically deal the next hand');
  }
  for (const [variant,mode] of [[0,'no-limit'],[1,'pot-limit']]) {
    const host='sizing-host-'+variant, guest='sizing-guest-'+variant;
    const room=await ok(host,{action:'create',variant,mode});
    const join=await ok(guest,{action:'join',code:room.code});
    const started=await ok(host,{action:'start',code:room.code,version:join.version});
    const actor=started.game.turn===0?host:guest;
    assert.equal((await call(actor,{action:'act',code:room.code,version:started.version,move:'raise',amount:100000})).status,400);
    const raised=await ok(actor,{action:'act',code:room.code,version:started.version,move:'raise',amount:30});
    assert.equal(raised.game.bet,30);
    const ended=await ok(guest,{action:'leave',code:room.code});
    assert(ended.ended);assert.equal(ended.reason,'Last player connected');
  }
  for(const cooldown of [0,12,120]){
    const host='cooldown-host-'+cooldown,guest='cooldown-guest-'+cooldown;
    const room=await ok(host,{action:'create',variant:0,aiCount:0,cooldownSeconds:cooldown});
    assert.equal(room.aiCount,0);assert.equal(room.cooldownSeconds,cooldown);
    assert.equal((await call(host,{action:'start',code:room.code,version:room.version})).status,400,'zero AI requires another human');
    const join=await ok(guest,{action:'join',code:room.code});
    assert.equal((await call(guest,{action:'configure',code:room.code,version:join.version,cooldownSeconds:2})).status,400);
    assert.equal((await call(host,{action:'configure',code:room.code,version:join.version,cooldownSeconds:121})).status,400);
    let state=await ok(host,{action:'start',code:room.code,version:join.version});
    assert.equal(state.members.length,2);assert(state.members.every(m=>!m.bot));
    while(!state.game.finished)state=await ok(state.game.turn===0?host:guest,{action:'act',code:room.code,version:state.version,move:'call'});
    if(cooldown>0){advance((cooldown-1)*1000); // Keep the other human present while testing long waits.
      const otherSeat=rows.get(room.code).state.members.find(m=>m.id===guest);otherSeat.seen=time();
      state=await ok(host,{action:'state',code:room.code});assert.equal(state.game.hand,1);advance(1000);
    }
    state=await ok(host,{action:'state',code:room.code});assert.equal(state.game.hand,2,'respect chosen cooldown');
    state=await ok(host,{action:'configure',code:room.code,version:state.version,cooldownSeconds:7});assert.equal(state.cooldownSeconds,7);
  }
  for(const cooldown of [-1,1.5,121,'5'])assert.equal((await call('invalid',{action:'create',variant:0,cooldownSeconds:cooldown})).status,400);
  const mixed = await ok('owner', { action: 'create', variant: 0, aiCount: 4, difficulty: 0 });
  let state = await ok('friend', { action: 'join', code: mixed.code });
  assert.equal((await call('extra', { action: 'join', code: mixed.code })).status, 400);
  state = await ok('owner', { action: 'start', code: mixed.code, version: state.version });
  assert.equal(state.members.filter(m => m.bot).length, 4);
  assert.equal(state.game.players.length, 6);
  assert(state.game.players.slice(1).every(p => p.cards.every(c => c === -1)));
  for (let i = 0; i < 100 && !state.game.finished; i++) {
    const member = rows.get(mixed.code).state.members[state.game.turn];
    state = await ok(member.bot ? 'owner' : member.id, { action: member.bot ? 'state' : 'act', code: mixed.code, version: state.version, move: 'call' });
  }
  assert(state.game.finished, 'AI must progress without host decisions for bots');
  assert.equal(state.game.players.reduce((sum, p) => sum + p.stack, 0), 6000);
  advance(46000);
  state = await ok('owner', { action: 'state', code: mixed.code });
  assert(state.ended); assert.equal(state.winner, 'Player'); assert.equal(state.reason, 'Last player connected');assert.equal(state.game.players[0].stack,6000);assert(state.game.players.slice(1).every(p=>p.cards.every(c=>c===-1)));
  const solo = await ok('solo', { action: 'create', variant: 0, aiCount: 1, difficulty: 0 });
  state = await ok('solo', { action: 'start', code: solo.code, version: solo.version });
  assert(!state.ended, 'one human may play against AI');
  const stored = rows.get(solo.code).state;
  stored.game.players[0].stack = 2000; stored.game.players[1].stack = 0;
  stored.game.finished = true;
  state = await ok('solo', { action: 'state', code: solo.code });
  assert(state.ended); assert.equal(state.reason, 'Tournament won');
  console.log('PASS: password required/rotation/fail-closed; authentication; membership; hidden cards; turns; concurrency; six variants auto-deal; mixed AI tables/capacity; disconnect timeout; tournament winner.');
})().catch(error => { console.error(error); process.exitCode = 1; });
