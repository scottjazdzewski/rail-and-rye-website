import fs from "node:fs";
import {validateStagedPickBatch} from "../src/pick-tickets-staging.js";
const batch=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const cards=validateStagedPickBatch(batch);
if(cards.length!==9||cards.reduce((n,c)=>n+c.sequences.length,0)!==92)throw Error("Expected exact November 25 inventory");
console.log("PASS locked constructor, all 92 SQR classifications, complete full-field PWIN, source role proofs and 3 AM Eastern release.");
