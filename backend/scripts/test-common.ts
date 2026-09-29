import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, hash, encrypt, decrypt } from '../src/common/idempotency.service.js';
test('canonical requests preserve array order but ignore object key order',()=>{
 assert.equal(hash(canonical({b:2,a:{d:4,c:3}})),hash(canonical({a:{c:3,d:4},b:2})));
 assert.notEqual(hash(canonical([1,2])),hash(canonical([2,1])));
 assert.notEqual(hash(canonical({body:{},query:{expectedVersion:1}})),hash(canonical({body:{},query:{expectedVersion:2}})));
});
test('invite replay encryption authenticates ciphertext and uses fresh nonces',()=>{
 const key=Buffer.alloc(32,7), value={code:'private-invite-value'};
 const first=encrypt(value,key), second=encrypt(value,key);
 assert.notDeepEqual(first,second);assert.deepEqual(decrypt(first,key),value);
 assert.equal(first.includes(Buffer.from(value.code)),false);
 const tampered=Buffer.from(first);tampered[28]^=1;
 assert.throws(()=>decrypt(tampered,key));assert.throws(()=>decrypt(first,Buffer.alloc(32,8)));
});
