"""Source-verified F4 V2 expected finishing places; no new model or PWIN changes.

The frozen TRI F4 V2 scorer emits exact ordered probabilities for the first
2, 3, and 4 places. Its approved release law uses one common conditional
weight vector from 3rd place onward (Plackett-Luce). Reconstruct that SAME
vector from receipt-verified F4 ordered prefixes, then use the F4 expected-
position identity on the complete remaining field. All observed 2/3/4
prefixes and all P1..P4 marginals MUST independently reproduce exactly.
No PWIN-only/row-index fallback is permitted on an R2 publish.
"""
import csv
import hashlib
import io
import math
from collections import defaultdict

MODEL = "TRI_F4_ORDERING_MODEL_V2_RANK_OFFSET"
MAX_PREFIX_BYTES = 12 * 1024 * 1024
CATEGORIES = {2: "EXACTA", 3: "TRIFECTA", 4: "SUPERFECTA"}


class F4OrderHold(RuntimeError):
    pass


def hold(ok, message):
    if not ok:
        raise F4OrderHold(message)


def parse_receipt_prefixes(archive, track, iso_date, receipt):
    ymd = iso_date.replace("-", "")
    path = f"internal_receipts/{track}/TRI_F4_V2_{ymd}_PRESCRATCH_ORDERED_PREFIXES.csv"
    hashkey = path.rsplit("/", 1)[1]
    hold(receipt.get("status") == "PASS"
         and receipt.get("model_id") == MODEL
         and receipt.get("scratch_state") == "PRESCRATCH"
         and receipt.get("expected_date") == iso_date
         and receipt.get("race_count", 0) > 0,
         "Official F4 V2 finish-order scorer receipt is not valid")
    expected_hash = (receipt.get("output_hashes") or {}).get(hashkey)
    hold(isinstance(expected_hash, str) and len(expected_hash) == 64,
         "Certified F4 V2 prefix hash absent")
    try:
        info = archive.getinfo(path)
        hold(info.file_size <= MAX_PREFIX_BYTES, "F4 ordered-prefix evidence too large")
        blob = archive.read(path)
    except KeyError as exc:
        raise F4OrderHold("Missing certified F4 ordered-prefix evidence") from exc
    hold(hashlib.sha256(blob).hexdigest() == expected_hash,
         "F4 ordered-prefix bytes do not match the certified scorer receipt")
    grouped = defaultdict(dict)
    reader = csv.DictReader(io.StringIO(blob.decode("utf-8-sig")))
    hold(reader.fieldnames == ["race_key", "position_prefix", "programs",
                              "probability", "wager_prefix"],
         "F4 ordered-prefix evidence schema changed")
    for row in reader:
        race_key = str(row["race_key"])
        hold(race_key.startswith(f"{ymd}|{track}|"), "Foreign F4 race in prefix evidence")
        try:
            index = int(row["position_prefix"])
            progs = tuple(row["programs"].split("-"))
            probability = float(row["probability"])
        except (TypeError, ValueError) as exc:
            raise F4OrderHold("Malformed F4 ordered-prefix evidence") from exc
        hold(index in CATEGORIES and len(progs) == index
             and row["wager_prefix"] == CATEGORIES[index]
             and all(progs) and len(set(progs)) == index
             and math.isfinite(probability) and probability > 0,
             "Illegal F4 ordered-prefix stage, roster or probability")
        hold(progs not in grouped[race_key], "Duplicate certified F4 ordered prefix")
        grouped[race_key][progs] = probability
    hold(len(grouped) == receipt["race_count"], "F4 prefix race count is incomplete")
    return grouped


def expected_finish_positions(entries, prefix):
    """Exact F4 V2 E[finish rank], reconstructed from its emitted prefix law."""
    programs = [str(x["program_number"]) for x in entries]
    n = len(programs)
    hold(2 <= n <= 30 and len(set(programs)) == n, "Invalid F4 finish-order field")
    roster = set(programs)
    hold(prefix and all(set(seq).issubset(roster) for seq in prefix),
         "F4 finish-order prefix contains a foreign program")
    for k in (2, 3, 4):
        if k > n:
            continue
        stage = {seq:pr for seq,pr in prefix.items() if len(seq) == k}
        hold(len(stage) == math.perm(n, k),
             "F4 missing a complete stage of ordered outcomes")
        hold(abs(sum(stage.values()) - 1) < 2e-9,
             "F4 ordered-outcome probability mass not one")
    hold(all(len(seq) <= min(n,4) for seq in prefix),
         "Unsupported F4 outcome stage")
    weights = {p:1.0 for p in programs}
    if n >= 4:
        reference = programs[0]
        for target in programs[1:]:
            a,b = [x for x in programs if x not in (reference,target)][:2]
            weights[target] = prefix[(a,b,target)] / prefix[(a,b,reference)]
        hold(all(math.isfinite(w) and w > 0 for w in weights.values()),
             "Invalid frozen F4 third-place conditional weights")
        for sequence, observed in prefix.items():
            if len(sequence) not in (3,4):
                continue
            base = sequence[:-1]
            available = [x for x in programs if x not in base]
            predicted = prefix[base] * weights[sequence[-1]] / sum(weights[x] for x in available)
            hold(abs(observed-predicted) <= 2e-10,
                 "F4 ordered prefixes disagree with frozen V2 P3+ transition law")
    positions = {p:[0.,0.,0.,0.] for p in programs}
    expected = {p:0.0 for p in programs}
    for sequence, probability in prefix.items():
        if len(sequence) == 2:
            first,second=sequence
            positions[first][0] += probability
            positions[second][1] += probability
            expected[first] += probability
            expected[second] += 2*probability
            remaining = [x for x in programs if x not in sequence]
            for runner in remaining:
                expected[runner] += probability * (3 + sum(
                    weights[other]/(weights[other]+weights[runner])
                    for other in remaining if other != runner))
        elif len(sequence) in (3,4):
            positions[sequence[-1]][len(sequence)-1] += probability
    hold(abs(sum(expected.values())-n*(n+1)/2) < 1e-7,
         "F4 expected finishing positions are not a coherent full-field permutation")
    for horse in entries:
        program=str(horse["program_number"])
        frozen=horse["f4_probabilities"]
        for index in range(min(n,4)):
            hold(abs(positions[program][index] - float(frozen[f"exact_p{index+1}"])) < 1e-9,
                 "F4 ordered prefixes conflict with frozen horse position marginals")
        hold(abs(positions[program][0]*100-float(horse["win_probability_exact"])) < 1e-8,
             "F4 winner probability conflicts with frozen TRI win chance")
    return expected


def assign_display_ranks(entries, expected):
    """Explicit customer rule: highest exact TRI PWIN first, then true F4 E[rank]."""
    hold(len(entries)==len(expected), "F4 ranks missing live runners")
    programs = [str(e["program_number"]) for e in entries]
    hold(set(programs)==set(expected), "F4 ranking has an incomplete field")
    lead = max(entries, key=lambda e:float(e["win_probability_exact"]))
    lead_program = str(lead["program_number"])
    original_index = {p:i for i,p in enumerate(programs)}
    order = [lead_program]+sorted(
        [p for p in programs if p != lead_program],
        key=lambda p:(expected[p],original_index[p]))
    rankmap={program:i+1 for i,program in enumerate(order)}
    hold(sorted(rankmap.values()) == list(range(1,len(entries)+1)),
         "F4 display rank must be the full 1..N permutation")
    for horse in entries:
        horse["rank"] = rankmap[str(horse["program_number"])]
    return order


def apply_certified_f4_order(cards, archive, iso_date, receipt_by_track):
    """Mutate ONLY presentation rank; all scores, odds and badges remain attached."""
    changed=0
    for card in cards:
        code = card["track_code"]
        receipt = receipt_by_track[code]
        prefixes = parse_receipt_prefixes(archive, code, iso_date, receipt)
        hold(len(prefixes)==len(card["races"]), "Certified F4 race set differs from model cards")
        for race in card["races"]:
            race_key = f"{iso_date.replace('-','')}|{code}|{race['race_number']}"
            hold(race_key in prefixes, "Missing certified F4 finishing-order race")
            expected=expected_finish_positions(race["entries"],prefixes[race_key])
            assign_display_ranks(race["entries"],expected)
            changed+=1
        hold(len(card["races"]) == receipt["race_count"],
             "F4 order does not cover every race")
    return changed
