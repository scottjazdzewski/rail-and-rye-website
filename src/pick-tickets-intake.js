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

/** November 24 card menu intake, never a surrogate for actual TRI scoring. */
const intake1124=Object.freeze({
 date:"2026-11-24",
 label:"November 24, 2026",
 status:"SOURCE_CARDS_RECEIVED__TRI_F4_SCORES_REQUIRED",
 card_source:"1124 TIMEFORM.zip",
 card_archive_sha256:"7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3",
 analysis_source:null,
 analysis_rows:null,
 probability_mass_review:"No November 24 certified TRI/F4 distributions supplied with these Timeform racecards.",
 missing_gate:"Fresh exact TRI/F4 whole-field results with source receipts and official scratches.",
 official_horizontal_sequence_count:50,
 tracks:[
  {name:"Delta Downs",race_count:8},
  {name:"Finger Lakes",race_count:8},
  {name:"Mahoning Valley",race_count:8},
  {name:"Mountaineer",race_count:8},
  {name:"Parx Racing",race_count:9},
  {name:"Zia Park",race_count:10}
 ]
});
export const getPickTicketsIntake1124=()=>structuredClone(intake1124);
