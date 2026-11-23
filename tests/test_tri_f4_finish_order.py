import itertools
import math
import os
import sys
import unittest
from copy import deepcopy

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from tri_f4_finish_order import expected_finish_positions, assign_display_ranks, F4OrderHold


def reference_model():
    # Synthetic, internally coherent 5-horse F4 V2 sequential law:
    # P1 frozen TRI vector, conditional P2, common conditional P3+ weights.
    programs=["1","2","3","4","5"]
    pwin=dict(zip(programs,[.42,.29,.16,.08,.05]))
    w2=dict(zip(programs,[.5,.3,2.,.7,.4]))
    w3=dict(zip(programs,[.3,.4,3.,.5,.2]))
    prefix={}
    actual_expected={p:0. for p in programs}
    for perm in itertools.permutations(programs):
        probability=pwin[perm[0]]
        for i in range(1,len(programs)):
            weights=w2 if i==1 else w3
            remaining=perm[i:]
            probability*=weights[perm[i]]/sum(weights[x] for x in remaining)
        for i,p in enumerate(perm):actual_expected[p]+=probability*(i+1)
        for k in (2,3,4):
            tup=perm[:k];prefix[tup]=prefix.get(tup,0.)+probability
    margins={p:[0.]*4 for p in programs}
    for seq,value in prefix.items():
        if len(seq)==2:
            margins[seq[0]][0]+=value
            margins[seq[1]][1]+=value
        else:margins[seq[-1]][len(seq)-1]+=value
    entries=[{"program_number":p,"win_probability_exact":pwin[p]*100,
              "f4_probabilities":{f"exact_p{k+1}":margins[p][k] for k in range(4)}} for p in programs]
    return entries,prefix,actual_expected


class FrozenF4ExpectedPositionTests(unittest.TestCase):
    def test_exact_v2_order_matches_full_sequential_distribution(self):
        entries,prefix,expected_truth=reference_model()
        expected=expected_finish_positions(entries,prefix)
        self.assertEqual(set(expected),set(expected_truth))
        for program,truth in expected_truth.items():
            self.assertAlmostEqual(expected[program],truth,places=11)
        order=assign_display_ranks(entries,expected)
        self.assertEqual(order[0],"1","Highest unmodified PWIN must lead")
        self.assertEqual(order[1:],sorted([x for x in expected if x!="1"],
                                           key=lambda x:expected[x]))
        self.assertEqual(sorted(e["rank"] for e in entries),list(range(1,6)))
        self.assertEqual(entries[0]["win_probability_exact"],42)
        self.assertAlmostEqual(sum(expected.values()),15.)

    def test_tampered_f4_third_place_transition_is_a_hard_hold(self):
        entries,prefix,_=reference_model()
        prefix[("1","2","3")]*=1.1
        with self.assertRaisesRegex(F4OrderHold,"probability mass|transition law"):
            expected_finish_positions(entries,prefix)

    def test_missing_full_field_outcome_is_a_hard_hold(self):
        entries,prefix,_=reference_model()
        del prefix[("1","2","3","4")]
        with self.assertRaisesRegex(F4OrderHold,"missing a complete stage"):
            expected_finish_positions(entries,prefix)

    def test_foreign_program_is_a_hard_hold(self):
        entries,prefix,_=reference_model()
        prefix[("1","2","3","X")]=0.001
        with self.assertRaisesRegex(F4OrderHold,"foreign program"):
            expected_finish_positions(entries,prefix)


if __name__=="__main__":
    unittest.main()
