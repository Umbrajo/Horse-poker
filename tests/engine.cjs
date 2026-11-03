const assert = require('node:assert/strict');
const { Poker } = require('../engine.js');
for (const mode of ['fixed', 'no-limit', 'pot-limit']) {
  const game = new Poker(2, mode === 'pot-limit' ? 1 : 0); game.mode = mode; game.start();
  if (mode !== 'fixed') {
    const before = game.clone();
    assert.throws(() => game.act('raise', game.legal().max + 1), /Invalid raise/);
    assert.equal(game.clone(), before);
    const legal = game.legal();
    if (mode === 'pot-limit') assert.equal(legal.max, game.bet + game.pot() + legal.call);
    const target = Math.min(legal.max, legal.min + 13);
    game.act('raise', target); assert.equal(game.bet, target);
    assert.equal(game.minRaise, target - 10);
  }
  let steps = 0;
  while (!game.finished && steps++ < 100) game.act('call');
  assert(game.finished); assert.equal(game.players.reduce((sum, p) => sum + p.stack, 0), 3000);
}
const short = new Poker(2, 0); short.mode = 'no-limit'; short.start();
short.act('raise', 100); // seat 0 raises; full increment 90
short.players[1].stack = 120 - short.players[1].paid;
short.act('raise', 120); // short all-in must not reopen seat 0's raise right
short.act('call');
assert.equal(short.turn, 0); assert.equal(short.legal().raise, false);
console.log('PASS: fixed/no-limit/pot-limit; raise bounds; pot cap; full-raise increments; short all-in reopening; complete hands and chip conservation.');
