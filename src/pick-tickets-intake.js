// Private admin-only Nov 23 intake ledger. This file contains NO runner selections, PWINs,
// payouts, or paid race intelligence. Counts were checked against the archived Timeform
// source and the separate 367-runner prescratch analysis CSV. This is NOT a scorer receipt.
const intake=Object.freeze({
 date:"2026-11-23",
 label:"November 23, 2026",
 status:"PRESCRATCH_SOURCE_RECEIVED__TICKETS_HOLD",
 card_source:"1123 TIMEFORM.zip",
 card_archive_sha256:"5d4f1bdeefc07ef85445a0168cea064867c10a3342dbefbded510e96a97e89e1",
 analysis_source:"TRI_1123_PRESCRATCH_367_RUNNERS.csv",
 analysis_rows:367,
 probability_mass_review:"Each race totals approximately 100% in the supplied analysis CSV; this is not score certification.",
 missing_gate:"Matching current-field TRI scoring receipt, authenticated source/person inputs, official sequence and denomination verification, and scratch reconciliation.",
 tracks:[
  {name:"Finger Lakes",race_count:8,analysis_runner_count:60},
  {name:"Mahoning Valley",race_count:10,analysis_runner_count:92},
  {name:"Mountaineer",race_count:8,analysis_runner_count:77},
  {name:"Parx Racing",race_count:9,analysis_runner_count:65},
  {name:"Zia Park",race_count:10,analysis_runner_count:73}
 ]
});
export const getPickTicketsIntake=()=>structuredClone(intake);
