# Longshot Radar — November 24, 2026 source intake / release HOLD

This file is an internal production gate record, **not** a customer publication and contains no horse picks.

## Verified Timeform source

- Drive source ID: `13Kvkyvny2fHTb13VmKFmy0rZDLYyu2KD` — `1124 TIMEFORM.zip`.
- ZIP SHA-256: `7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3`.
- Extracted and validated November 24, 2026 TimeformUS cards: **6 tracks, 51 races, 430 printed runners**.
- Morning-line-first-stage 6/1-or-higher: **246 printed runners**, **NOT Radar selections**.

| Track | Races | Printed runners | ML >=6/1 | Source PDF SHA-256 |
|---|---:|---:|---:|---|
| Delta Downs | 8 | 65 | 36 | `ada93692ab38f9ee2f9b04ffc87fe08e49914fdca0ee827e9d6ec8e0c81f57fa` |
| Finger Lakes | 8 | 65 | 34 | `7b0a7eeeccf37847ab9231bb6f90dbb0f0222099b250017dfb59cf8c538ed4aa` |
| Mountaineer | 8 | 66 | 39 | `61333b8fce26c963f894aee0ab09741924d9de235d8b22d8f5b7a18260b67830` |
| Mahoning Valley | 8 | 67 | 39 | `f73aad9dc47aa1ce31725aefff7029cb20b360faae54813e627f9d427e374b62` |
| Parx Racing | 9 | 74 | 42 | `9e6ebe477685c4a9562a370c7bb1df8848cf5d7932caff6d2ab51ba153663e3d` |
| Zia Park | 10 | 93 | 56 | `ed675fea6efef01f3aeeb08201e04ebc67c8babfcc8e99dcd07273158c8af875` |

**Parsing note:** Zia Park R10 begins with the source label `RACE\n10 Zia Park` on PDF page 26; matching only a race number followed by a newline would incorrectly omit this race. This intake recognizes the 10th race and checks full program-number uniqueness within each track/race.

## Locked model requirements

- Frozen TRI V4.1 scorer ZIP retrieved and its canonical SHA-256 independently confirmed: `de289a89bcb5d4759cd8255819149557640faee5787fc642e5e3d0725c346025`.
- Frozen model's production launcher `CODE/score_current_runtime_v1_3_7.py` explicitly **requires** the November 24 exact-card trainer/jockey system registry, line-level connection evidence, and as-of person-rating evidence. The supplied source ZIP includes six TimeformUS PDFs **and no such sidecars**.
- Do not run the immutable mathematical parent scorer directly or fabricate source statuses, zero meanings, trainer/jockey ratings, F4 score or exact win probabilities to bypass the gate.
- All candidate admissions require: original ML >=6/1; **exact signed TRI PWIN >=1/7**; theoretical original ML edge `pwin_exact*(1+ML_net)-1 >= 0.5`; independently verified, race-specific causal thesis/counterargument. Scratch updates require a newly scored complete active field.
- Confirm an independently receipt-verified TRI V4.1+F4 V2 prescratch score for all eligible source races before constructing the Radar. Never equate one of the 246 first-stage screened runners with a selection.
- Private site stays on the last verified edition until approved new source and selections are stored. Customer launch and model modifications remain off.

## Private R2 readiness query

`scripts/radar_1124_readiness.py` is a read-only GitHub Action probe of `projections/dashboard/2026-11-24/` and the date-specific Radar private review object. It does **not** score, publish, change, or expose actual horse data. A missing source / signed receipt yields `HOLD`.
