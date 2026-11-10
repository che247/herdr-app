const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../mods/pixel-agents');
const source = name => fs.readFileSync(path.join(root,name),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const heads = new Function(source('sprite-heads.js')+'; return HEADS;')();
const store = {};
const element = () => new Proxy({}, {get: (_,key) => (...args) => element()});
const sprites = new Function('div','shared','setShared','HEADS',source('instance-sprites.js')+'; return {spriteIdentity,drawSprite};')(
  element, key => store[key], (key,value) => {store[key]=value;}, heads
);
const first = sprites.spriteIdentity('t1',100);
const second = sprites.spriteIdentity('t2',100);
assert.notEqual(first.index,second.index);
assert.notEqual(first.color,second.color);
assert.deepEqual(sprites.spriteIdentity('t1',100),first); // State, provider, and sort order cannot change identity.
assert.notEqual(sprites.spriteIdentity('remote/t1',100).index,first.index);
assert.notEqual(sprites.spriteIdentity('t1',200).index,first.index); // New terminal lifetime.
sprites.drawSprite(first,48);
sprites.drawSprite(second,48);
const quotas = new Function('div','h_flex','v_flex',source('quota-meters.js')+'; return {quotaWindows,quotaMeters};')(element,element,element);
const snapshot = {updated:'2026-11-07T00:00:00Z', limits:{primary:{used_percent:12,window_minutes:300},secondary:{used_percent:5,window_minutes:10080}}};
const windows = quotas.quotaWindows(snapshot);
assert.deepEqual(windows.map(w=>[w.label,w.remaining]),[['5h',88],['Week',95]]);
assert.deepEqual(quotas.quotaWindows(null),[]);
assert.equal(quotas.quotaWindows({limits:{primary:{used_percent:150}}})[0].remaining,0);
assert.equal(quotas.quotaWindows({limits:{primary:{used_percent:-5}}})[0].remaining,100);
assert.deepEqual(quotas.quotaWindows({limits:{primary:{used_percent:NaN}}}),[]);
quotas.quotaMeters(windows,{muted:'#888888',input:'#333333'});
console.log('Agent identity, sprite rendering, and remaining-quota meter checks passed.');
