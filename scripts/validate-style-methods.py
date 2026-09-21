"""Controlled perturbations test what the descriptive metrics can actually detect.

These are diagnostic controls, not generated candidates or human-rated bad prose.
"""
import collections
import hashlib
import html
import importlib.util
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/fulltext-analysis-20260921"


def variants(text):
    lines = text.split("\n")
    return {
        "reverse_lines": "\n".join(reversed(lines)),
        "flatten_lines": text.replace("\n", " "),
        "periodize_lines": "\n".join(
            line + "。" if line.strip() and line.rstrip()[-1] not in "。！？!?" else line
            for line in lines),
    }


def main():
    spec = importlib.util.spec_from_file_location("fulltext", ROOT / "scripts/analyze-fulltext.py")
    fulltext = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fulltext)
    tested = json.loads((OUT / "tested-state.json").read_text(encoding="utf-8"))
    tested_files = {path.replace("\\", "/"): digest for path, digest in tested["files"].items()}
    # Reuse only the same, hash-verified source selection, not an undocumented cache.
    for path in ("scripts/analyze-fulltext.py", "artifacts/fulltext-analysis-20260921/posts.jsonl",
                 "artifacts/fulltext-analysis-20260921/vectors.json"):
        assert fulltext.sha(ROOT / path) == tested_files[path], f"Source changed: {path}"
    all_posts = [json.loads(s) for s in (OUT / "posts.jsonl").read_text(encoding="utf-8").splitlines()]
    posts = []
    seen = set()
    for post in all_posts:
        if post["text"] and post["text"] not in seen:
            posts.append(post)
            seen.add(post["text"])
    assert len(posts) == 2363
    texts = [p["text"] for p in posts]
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 4), min_df=2,
        max_features=12000, sublinear_tf=True, lowercase=False, dtype=np.float64)
    mat = vectorizer.fit_transform(texts)
    centroid = normalize(np.asarray(mat.mean(axis=0)))
    vocabulary_hash = hashlib.sha256(json.dumps(vectorizer.get_feature_names_out().tolist(),
                                               ensure_ascii=False).encode()).hexdigest()
    prior = json.loads((OUT / "vectors.json").read_text(encoding="utf-8"))
    assert vocabulary_hash == prior["models"]["lexical"]["vocabulary_sha256"]
    baseline = (mat @ centroid.T).ravel()
    rows = []
    feature_cache = [fulltext.features(t) for t in texts]
    for mode in ("reverse_lines", "flatten_lines", "periodize_lines"):
        # Use all eligible posts, not selected famous examples; publish IDs for every comparison.
        selected = [i for i,t in enumerate(texts) if sum(bool(s.strip()) for s in t.splitlines()) >= 3
                    and variants(t)[mode] != t]
        altered = [variants(texts[i])[mode] for i in selected]
        changed = vectorizer.transform(altered)
        cosines = (changed @ centroid.T).ravel()
        for i, text, score in zip(selected, altered, cosines):
            old = feature_cache[i]
            new = fulltext.features(text)
            identical = [k for k in old if abs(old[k] - new[k]) < 1e-10]
            if mode == "reverse_lines":
                assert collections.Counter(text) == collections.Counter(texts[i])
                assert sorted(text.splitlines()) == sorted(texts[i].splitlines())
            if mode == "flatten_lines":
                assert text.replace(" ", "") == texts[i].replace(" ", "").replace("\n", "")
            if mode == "periodize_lines":
                assert text.replace("。", "") == texts[i].replace("。", "")
            rows.append(dict(id=posts[i]["id"], line=posts[i]["start_line"], mode=mode,
                original_cosine=float(baseline[i]), perturbed_cosine=float(score),
                cosine_delta=float(score-baseline[i]), identical_feature_count=len(identical),
                all_33_features_identical=len(identical) == len(old)))
        print(f"{mode}: {len(selected)} controlled pairs", flush=True)
    summaries = {}
    for mode in ("reverse_lines", "flatten_lines", "periodize_lines"):
        group = [r for r in rows if r["mode"] == mode]
        delta = np.array([r["cosine_delta"] for r in group])
        summaries[mode] = dict(pairs=len(group), original_mean=float(np.mean([r["original_cosine"] for r in group])),
            perturbed_mean=float(np.mean([r["perturbed_cosine"] for r in group])),
            mean_delta=float(delta.mean()), median_absolute_delta=float(np.median(np.abs(delta))),
            share_with_absolute_delta_below_001=float(np.mean(np.abs(delta)<.01)),
            share_with_increased_centroid_cosine=float(np.mean(delta>1e-10)),
            all_33_features_identical=sum(r["all_33_features_identical"] for r in group))
    # Include actual altered passages so a reader can inspect the intervention, not just its score.
    examples = []
    for line in (12990, 13773, 14999):
        post = next((p for p in posts if p["header_line"] == line), None)
        if post:
            examples.append(dict(id=post["id"], line=post["start_line"], original=post["text"],
                                 diagnostic_controls=variants(post["text"])))
    assert examples and examples[0]["id"] == "raw-L12990"
    result = dict(scope="paired diagnostic controls on all unique posts with at least three nonempty lines",
        source_sha256=fulltext.sha(OUT / "posts.jsonl"), analysis_script_sha256=fulltext.sha(ROOT / "scripts/analyze-fulltext.py"),
        script_sha256=fulltext.sha(__file__), reference_posts=len(posts), vocabulary_sha256=vocabulary_hash,
        summaries=summaries, examples=examples, human_quality_labels=False,
        limitation="Reordering does not automatically make every passage worse. This measures sensitivity to a controlled intervention, not accuracy against human judgments.")
    fulltext.write_json(OUT / "method-validation.json", result)
    fulltext.csv_write(OUT / "method-validation-pairs.csv", rows)
    render(result)
    print(json.dumps(summaries, ensure_ascii=False), flush=True)


def render(result):
    names = {"reverse_lines":"行の順序を逆転", "flatten_lines":"改行を空白に置換", "periodize_lines":"各行末に句点を補う"}
    parts = ['<h1>分析手法の妥当性を確かめる条件比較</h1>',
        '<p>コサイン・PCA・クラスタリングを使うこと自体を目的にせず、どの変化を捉えられるか検査しました。これは指標の検査用データで、生成候補でも、人間が低品質と評価した正解データでもありません。</p>',
        '<p>完全重複を除いた原文2,363投稿で作った同じ語彙空間を使用。非空行が3行以上あり、操作によって実際に変化する全投稿を条件ごとに比較しています。</p>',
        '<table><tr><th>操作</th><th>件数</th><th>コサイン変化平均</th><th>絶対変化の中央値</th><th>33特徴すべて不変</th></tr>']
    for mode, s in result['summaries'].items():
        parts.append(f'<tr><td>{names[mode]}</td><td>{s["pairs"]}</td><td>{s["mean_delta"]:+.5f}</td><td>{s["median_absolute_delta"]:.5f}</td><td>{s["all_33_features_identical"]}/{s["pairs"]}</td></tr>')
    parts.append('</table><h2>手法の使い分け</h2><ul><li>句読点・改行の偏り：原文の全数集計、長さと引用を分けた比較、同じ本文の条件比較。</li><li>語彙・表記の共通性：文字列のコサインと原文の最近傍。文の意味や自然さの点数にはしない。</li><li>データの混在：PCA・クラスタリングで確認し、代表原文に戻って解釈する。軸や群を本物度と呼ばない。</li><li>語尾と後続節の関係：原文の用例を前後付きで読み、後続説明・対比・疑問・引用等を区別する。単純な部分文字列の一致は語尾認定に使わない。</li><li>出来事の順序・因果・意味保持：入力と出力の関係を直接照合する。行順を変えても変わらない集計特徴では判定できない。</li><li>ブロント語としての自然さ：以上の検査を通した後、ユーザーが人間評価する。</li></ul>')
    parts.append('<p>行の並べ替えだけで必ず品質が下がるとは仮定していません。ただし、この操作で特徴が変わらない文については、その特徴に基づくPCA・クラスタリングでも順序の変化を検出できません。人間評価がまだないため、指標の品質判定精度は算出していません。</p><h2>原文と検査用の変更例</h2>')
    for example in result['examples']:
        parts.append(f'<h3>{example["id"]}（原文{example["line"]}行から）</h3><details><summary>原文</summary><pre>{html.escape(example["original"])}</pre></details>')
        for mode, text in example['diagnostic_controls'].items():
            parts.append(f'<details><summary>検査用：{names[mode]}</summary><pre>{html.escape(text)}</pre></details>')
    parts.append('<p><a href="method-validation.json">全結果JSON</a> / <a href="method-validation-pairs.csv">全比較ペア</a> / <a href="report.html">全文解析レポート</a></p>')
    doc='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>分析手法の条件比較</title><style>body{max-width:1050px;margin:40px auto;padding:0 24px;font:16px/1.8 "Yu Gothic",sans-serif;color:#203044;background:#fafbfc}h1,h2{line-height:1.4}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;border-bottom:1px solid #ccd3dc;text-align:right}td:first-child{text-align:left}pre{white-space:pre-wrap;background:#eef1f5;padding:18px;line-height:1.7}details{margin:16px 0}summary{cursor:pointer}</style>'+''.join(parts)+'</html>'
    (OUT / 'method-validation.html').write_text(doc, encoding='utf-8')


if __name__ == "__main__":
    with threadpool_limits(limits=1):
        main()
