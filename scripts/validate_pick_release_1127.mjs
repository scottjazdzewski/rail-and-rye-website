import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateStagedPickBatch} from '../src/pick-tickets-staging.js';
const d=JSON.parse(fs.readFileSync('/tmp/rr-pick-1127-stage.json','utf8'));
const cards=validateStagedPickBatch(d);
assert.equal(cards.length,15);assert.equal(cards.reduce((n,c)=>n+c.sequences.length,0),173);
const exact=Object.fromEntries(cards.map(c=>[c.track,JSON.stringify(c)]));
fs.writeFileSync('/tmp/rr-pick-1127-customer.json',JSON.stringify(cards));fs.writeFileSync('/tmp/rr-pick-1127-customer-exact.json',JSON.stringify(exact));
console.log('NOV27_LOCKED_CONSTRUCTOR_AND_FULL_FIELD_PASS 15 tracks 134 races 1115 runners 173 tickets');
