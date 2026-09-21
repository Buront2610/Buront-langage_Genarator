"""Independent artifact checks; run after scripts/analyze-fulltext.py completes."""
import csv
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/fulltext-analysis-20260921"


class FulltextAnalysisTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads((OUT / "report.json").read_text(encoding="utf-8"))
        cls.manifest = cls.report["manifest"]
        with (OUT / "line-ledger.csv").open(encoding="utf-8-sig", newline="") as f:
            cls.ledger = list(csv.DictReader(f))
        cls.posts = [json.loads(line) for line in (OUT / "posts.jsonl").read_text(encoding="utf-8").splitlines()]

    def test_complete_lossless_line_accounting(self):
        raw = Path(self.manifest["raw_path"]).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), self.manifest["raw_sha256"])
        lines = raw.decode("utf-8-sig").replace("\r\n", "\n").split("\n")
        self.assertEqual([r["text"] for r in self.ledger], lines)
        self.assertEqual([int(r["line"]) for r in self.ledger], list(range(1, len(lines) + 1)))
        self.assertEqual(sum(self.manifest["categories"].values()), len(lines))
        self.assertNotIn("unassigned", self.manifest["categories"])

    def test_quoted_headers_do_not_create_false_posts(self):
        headers = {p["header_line"] for p in self.posts}
        for line in (5702, 11033, 12238, 15647):
            self.assertEqual(self.ledger[line - 1]["category"], "embedded_quote_header")
            self.assertNotIn(line, headers)
        p = next(p for p in self.posts if p["header_line"] == 5701)
        self.assertIn("これでもグラットンが", p["text"])
        self.assertNotIn("500 名前", p["text"])
        self.assertIn("500 名前", p["body"])
        self.assertNotIn("各アイテムの廃人ランク", p["narration_text"])

    def test_empty_records_retained_but_excluded_from_vectors(self):
        self.assertEqual(len(self.posts), self.manifest["posts"])
        empty = [p for p in self.posts if not p["text"]]
        self.assertEqual({p["header_line"] for p in empty}, {5242, 5666})
        self.assertEqual(len(self.posts) - len(empty), self.manifest["analyzed_nonempty_posts"])
        self.assertEqual(self.manifest["exact_unique_posts"] + self.manifest["duplicate_posts"], self.manifest["analyzed_nonempty_posts"])

    def test_raw_punctuation_totals_independently(self):
        texts = [p["text"] for p in self.posts if p["text"]]
        group = self.report["groups"]["all_raw_posts"]
        self.assertEqual(group["periods"], sum(t.count("。") for t in texts))
        self.assertEqual(group["commas"], sum(t.count("、") for t in texts))
        self.assertEqual(group["posts"], len(texts))
        self.assertEqual(group["final_period_posts"], sum(t.rstrip().endswith("。") for t in texts) / len(texts))

    def test_projection_scope_and_saved_output_provenance(self):
        # This report describes a historical generator snapshot. Later fixes must
        # not be mistaken for changes to the saved outputs being analyzed.
        provenance = self.manifest["provenance"]
        saved = ROOT / "artifacts/full-log-reread/outputs.json"
        self.assertEqual(hashlib.sha256(saved.read_bytes()).hexdigest(), self.manifest["generated_sha256"])
        self.assertEqual(json.loads(saved.read_text(encoding="utf-8"))["engine"], provenance["output_engine"])
        recorded = json.loads((ROOT / "artifacts/full-log-reread/generation-tested-files.json").read_text(encoding="utf-8"))
        self.assertEqual(provenance["current_source_hashes"], recorded)
        self.assertEqual(provenance["previous_source_hash_record"], recorded)
        self.assertTrue(provenance["generation_sources_match"])
        with (OUT / "probe-features.csv").open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(sum(r["kind"] == "input" for r in rows), 37)
        self.assertEqual(sum(r["kind"] == "generated" for r in rows), 75)
        self.assertTrue(self.manifest["original_only_fitting"])
        self.assertFalse(self.manifest["human_ratings_submitted"])
        for result in self.report["cosine"].values():
            self.assertEqual(result["generated_inputs"], 32)
        self.assertEqual(sum(c["unique_posts"] for c in self.report["clustering"]["clusters"]), self.manifest["exact_unique_posts"])
        variance = self.report["pca"]["explained_variance"]
        self.assertAlmostEqual(sum(variance), 1)
        self.assertTrue(all(0 <= v <= 1 for v in variance))


if __name__ == "__main__":
    unittest.main()
