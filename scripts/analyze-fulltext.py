"""Reproducible descriptive analysis of the entire local log, not an authorship classifier.

Run from repository root: .venv/Scripts/python.exe -X utf8 scripts/analyze-fulltext.py
No application state, corpus assets, or human-review ratings are changed.
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import html
import importlib.metadata
import itertools
import json
import re
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA, TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler, normalize
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
HEADER = re.compile(r"^\s*\d+\s*(?:名前[：:]|[：:]|[.．]\s).+?\d{2}/\d{2}/\d{2}")
ANCHOR = re.compile(r"^\s*(?:>>|＞＞)\s*[0-9０-９]+(?:[-ー,、\s0-9０-９>＞]*)$")
STOP = "。．.!！?？"
PUNCT = "。、，．.!！?？…‥・「」『』（）()【】[]：:；;―—ー～〜"
SEED = 1729
KNOWN_LOG_HASH = "983ba86ddf086d7bc842d91c66a4bc1bab940c126682b436538d5df7a68df752"
EMBEDDED_HEADERS = {5702, 11033, 12238, 15647}
EMBEDDED_QUOTE_LINES = set(range(5704, 5711)) | set(range(15648, 15656))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def csv_write(path, rows):
    if not rows:
        return
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def segment(raw, archive):
    # Use split('\n') deliberately: retain the final empty segment and raw line numbering.
    lines = raw.replace("\r\n", "\n").split("\n")
    titles = {p["threadTitle"].strip() for p in archive["posts"]}
    headers = [i for i, text in enumerate(lines) if HEADER.match(text) and i + 1 not in EMBEDDED_HEADERS]
    title_lines = {0, 17, 36, 16107}  # Four manually checked titles absent from archive title list.
    for head, end in zip(headers, headers[1:] + [len(lines)]):
        chunks = []
        for i in range(head + 1, end):
            if lines[i].strip() and (i == head + 1 or not lines[i - 1].strip()):
                start = i
            if lines[i].strip() and (i == end - 1 or not lines[i + 1].strip()):
                chunks.append((start, i))
        for start, last in chunks[1:]:
            previous = next((j for j in range(start - 1, head, -1) if lines[j].strip()), head)
            if start == last and (start - previous - 1 >= 3 or lines[start].strip() in titles):
                title_lines.add(start)
    editorial = {16108}  # Compiler explicitly disclaims original-source certainty here.
    posts, ledger = [], []
    current = None
    section = "unassigned"
    section_start = 1
    for i, text in enumerate(lines):
        row = dict(line=i + 1, category="", post_id="", text=text)
        if not text.strip():
            row["category"] = "blank"
            if current is not None:
                current["body_lines"].append((i + 1, text))
        elif i in title_lines:
            row["category"] = "section_title"
            section, section_start, current = text.strip(), i + 1, None
        elif i in editorial:
            row["category"] = "editorial_note"
        elif i + 1 in EMBEDDED_HEADERS:
            assert current is not None
            row.update(category="embedded_quote_header", post_id=current["id"])
            current["body_lines"].append((i + 1, text))
        elif HEADER.match(text):
            date = re.search(r"(\d{2,4})/(\d{2})/(\d{2})", text)
            year = int(date[1])
            if year < 100:
                year += 2000 if year < 70 else 1900
            if "天晶暦" in text:
                year = None  # Preserve the fictional calendar; do not call it Gregorian year 968.
            current = dict(id=f"raw-L{i+1:05d}", header_line=i + 1, header=text,
                           year=year, raw_date=date[0], section=section, section_line=section_start, body_lines=[],
                           attribution="unverified_mixed_speakers",
                           source_caution=section_start in (15618, 16108, 16134))
            posts.append(current)
            row.update(category="post_header", post_id=current["id"])
        elif current is None:
            row["category"] = "unassigned"
        else:
            category = "anchor" if ANCHOR.match(text) else "quoted_line" if re.match(r"^\s*[>＞]", text) or i + 1 in EMBEDDED_QUOTE_LINES else "body"
            row.update(category=category, post_id=current["id"])
            current["body_lines"].append((i + 1, text))
        ledger.append(row)
    for post in posts:
        body = post.pop("body_lines")
        while body and not body[-1][1].strip():
            body.pop()
        while body and not body[0][1].strip():
            body.pop(0)
        post["start_line"] = body[0][0] if body else post["header_line"]
        post["end_line"] = body[-1][0] if body else post["header_line"]
        post["body"] = "\n".join(t for _, t in body)
        post["text"] = "\n".join(t for line, t in body if not ANCHOR.match(t) and line not in EMBEDDED_HEADERS).strip()
        post["narration_text"] = outside_quotes("\n".join(t for line, t in body if not ANCHOR.match(t) and line not in EMBEDDED_HEADERS and line not in EMBEDDED_QUOTE_LINES)).strip()
    return lines, posts, ledger


def outside_quotes(text):
    # Preserve newlines and offsets; mask explicit block quotations and Japanese quotation brackets.
    chars = list(text)
    stack = []
    line_start = True
    block = False
    for i, c in enumerate(text):
        if line_start:
            block = bool(re.match(r"\s*[>＞]", text[i:].split("\n", 1)[0]))
            line_start = False
        if c == "\n":
            line_start, block = True, False
            continue
        if c in "「『":
            stack.append("」" if c == "「" else "』")
            chars[i] = " "
        elif stack or block:
            chars[i] = " "
            if stack and c == stack[-1]:
                stack.pop()
    return "".join(chars)


def measures(text):
    ls = [s.strip() for s in text.splitlines() if s.strip()]
    lengths = [len(re.sub(r"\s", "", s)) for s in ls]
    n = max(1, len(re.sub(r"\s", "", text)))
    external = outside_quotes(text)
    ext = len(re.sub(r"\s", "", external))
    return dict(chars=n, lines=len(ls), newlines=text.count("\n"),
                periods=text.count("。"), commas=text.count("、"),
                exclaims=len(re.findall(r"[!！]", text)), questions=len(re.findall(r"[?？]", text)),
                outside_periods=external.count("。"), outside_commas=external.count("、"), outside_chars=ext,
                line_no_stop=sum(s[-1] not in STOP for s in ls),
                line_no_jp_punct=sum(not re.search(r"[。、]", s) for s in ls),
                line_ends_period=sum(s.endswith("。") for s in ls),
                final_period=int(bool(ls) and ls[-1].endswith("。")),
                no_jp_punct=int(not re.search(r"[。、]", text)),
                mean_line=float(np.mean(lengths)) if lengths else 0,
                max_line=max(lengths, default=0),
                blank_lines=sum(not s.strip() for s in text.splitlines()))


def features(text):
    m = measures(text)
    n, lines = m["chars"], max(m["lines"], 1)
    rate = lambda pattern: len(re.findall(pattern, text)) * 100 / n
    f = dict(log_chars=np.log1p(n), log_lines=np.log1p(lines),
             log_mean_line=np.log1p(m["mean_line"]), log_max_line=np.log1p(m["max_line"]),
             periods_100=m["periods"] * 100 / n, commas_100=m["commas"] * 100 / n,
             question_100=m["questions"] * 100 / n, exclaim_100=m["exclaims"] * 100 / n,
             newline_100=m["newlines"] * 100 / n,
             no_stop_line_ratio=m["line_no_stop"] / lines,
             no_jp_punct_line_ratio=m["line_no_jp_punct"] / lines,
             terminal_period_ratio=m["line_ends_period"] / lines,
             quote_100=rate(r"[「『]"), parenthesis_100=rate(r"[（(]"),
             ellipsis_100=rate(r"(?:[.．・]{2,}|[…‥]+)"),
             repeat_symbol_100=rate(r"([!?！？ｗwー～])\1+"),
             comma_ascii_100=rate(r"[,，]"), space_100=rate(r"[ 　]"),
             hiragana_ratio=rate(r"[ぁ-ゖ]") / 100, kanji_ratio=rate(r"[一-龯々]") / 100,
             katakana_ratio=rate(r"[ァ-ヺ]") / 100, half_kana_ratio=rate(r"[ｦ-ﾟ]") / 100,
             latin_ratio=rate(r"[a-zA-Zａ-ｚＡ-Ｚ]") / 100, digit_ratio=rate(r"[0-9０-９]") / 100,
             polite_100=rate(r"です|ます|でした|ました|ません|でしょう"),
             first_person_100=rate(r"俺|おれ|オレ|私|僕"),
             second_person_100=rate(r"お前|おまえ|おまい|君|あんた"),
             connective_100=rate(r"だから|しかし|だが|さらに|しかも|やはり|なので|ところが|すると"),
             quotative_100=rate(r"という|と言う|といった|と言った|と言うと|と聞く"),
             hedge_100=rate(r"かもしれ|たぶん|多分|おそらく|思う|みたい|らしい"),
             nda_ga_100=rate(r"んだが"), karana_100=rate(r"からな"),
             be_100=rate(r"(?:だべ|べ[?？]|べ$)"))
    return f


def summarize(items):
    if not items:
        return dict(posts=0)
    ms = [measures(x) for x in items]
    total = lambda key: sum(m[key] for m in ms)
    return dict(posts=len(ms), chars=total("chars"), lines=total("lines"),
                median_chars=float(np.median([m["chars"] for m in ms])),
                median_line_chars=float(np.median([m["mean_line"] for m in ms])),
                periods=total("periods"), commas=total("commas"),
                period_per_100=100 * total("periods") / max(total("chars"), 1),
                comma_per_100=100 * total("commas") / max(total("chars"), 1),
                newline_per_100=100 * total("newlines") / max(total("chars"), 1),
                no_jp_punct_posts=total("no_jp_punct") / len(ms),
                final_period_posts=total("final_period") / len(ms),
                no_stop_lines=total("line_no_stop") / max(total("lines"), 1),
                outside_period_per_100=100 * total("outside_periods") / max(total("outside_chars"), 1),
                outside_comma_per_100=100 * total("outside_commas") / max(total("outside_chars"), 1),
                question_per_100=100 * total("questions") / max(total("chars"), 1))


def script_mask(text):
    out = []
    for c in text:
        if "ぁ" <= c <= "ゖ": c = "h"
        elif "ァ" <= c <= "ヺ": c = "k"
        elif "ｦ" <= c <= "ﾟ": c = "q"
        elif "一" <= c <= "龯" or c == "々": c = "H"
        elif c.isdigit(): c = "D"
        elif c.isalpha(): c = "A"
        out.append(c)
    return "".join(out)


def cluster_fit(x):
    trials, fits = [], {}
    for k in range(2, 9):
        labels = []
        scores = []
        for seed in (SEED, 29, 41):
            model = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(x)
            labels.append(model.labels_)
            scores.append(float(silhouette_score(x, model.labels_, sample_size=min(1200, len(x)), random_state=SEED)))
            if seed == SEED: fits[k] = model
        trials.append(dict(k=k, silhouette_mean=float(np.mean(scores)), silhouette_seeds=scores,
                           stability_ari=float(np.mean([adjusted_rand_score(a, b) for a, b in itertools.combinations(labels, 2)]))))
    # Exploratory choice, not evidence that discrete "true styles" exist.
    best = max(trials, key=lambda t: t["silhouette_mean"])["k"]
    return fits[best], trials


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--log", type=Path, default=Path(r"C:/Users/Glutt/OneDrive/デスクトップ/burontlog.txt"))
    parser.add_argument("--out", type=Path, default=ROOT / "artifacts/fulltext-analysis-20260921")
    args = parser.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    raw_bytes = args.log.read_bytes()
    assert hashlib.sha256(raw_bytes).hexdigest() == KNOWN_LOG_HASH, "Review manual boundary annotations for the changed source first"
    raw = raw_bytes.decode("utf-8-sig")
    archive_path = ROOT / "data/log-corpus.json"
    generated_path = ROOT / "artifacts/full-log-reread/outputs.json"
    archive = json.loads(archive_path.read_text(encoding="utf-8-sig"))
    generated = json.loads(generated_path.read_text(encoding="utf-8-sig"))
    lines, posts, ledger = segment(raw, archive)
    assert len(ledger) == len(lines) and all(x["category"] for x in ledger)
    empty_posts = [p for p in posts if not p["text"]]
    assert {p["header_line"] for p in empty_posts} == {5242, 5666}, "Unexpected empty/anchor-only post requires review"
    assert all(not HEADER.match(t) for p in posts for t in p["text"].splitlines())
    csv_write(out / "line-ledger.csv", ledger)
    csv_write(out / "sections.csv", [x for x in ledger if x["category"] in ("section_title", "editorial_note", "unassigned")])
    (out / "posts.jsonl").write_text("\n".join(json.dumps(p, ensure_ascii=False) for p in posts), encoding="utf-8")
    post_count = len(posts)
    posts = [p for p in posts if p["text"]]
    seen, unique = {}, []
    for p in posts:
        key = p["text"]  # Only exact duplicates after trimming outer whitespace and standalone reply anchors.
        if key not in seen:
            seen[key] = len(unique)
            unique.append(p)
        p["unique_index"] = seen[key]
    texts = [p["text"] for p in unique]
    input_rows = [dict(id=f"input-{i+1:02}", input_index=i, text=r["source"]) for i, r in enumerate(generated["rows"])]
    output_rows = [dict(id=c["id"], input_index=i, text=c["text"])
                   for i, r in enumerate(generated["rows"]) for c in r["result"]["candidates"]]
    probes = input_rows + output_rows
    ft = [features(t) for t in texts]
    names = list(ft[0])
    x = np.array([[f[n] for n in names] for f in ft])
    xp = np.array([[features(p["text"])[n] for n in names] for p in probes])
    upper = np.quantile(x, .99, axis=0)
    scaler = StandardScaler().fit(np.minimum(x, upper))
    z, zp = scaler.transform(np.minimum(x, upper)), scaler.transform(np.minimum(xp, upper))
    pca = PCA(random_state=SEED).fit(z)
    pc, pp = pca.transform(z), pca.transform(zp)
    km, trials = cluster_fit(z)
    labels = km.labels_
    # Length ablation: remove four explicit length dimensions, preserving punctuation/line ratios.
    keep = [i for i, name in enumerate(names) if not name.startswith("log_")]
    no_length = KMeans(n_clusters=km.n_clusters, n_init=20, random_state=SEED).fit(z[:, keep])
    pca_no_length = PCA(random_state=SEED).fit(z[:, keep])
    pc_no_length = pca_no_length.transform(z[:, keep])
    pp_no_length = pca_no_length.transform(zp[:, keep])
    unclipped = StandardScaler().fit_transform(x)
    unclipped_km = KMeans(n_clusters=km.n_clusters, n_init=20, random_state=SEED).fit(unclipped)
    print(f"Parsed {len(lines)} line segments; {len(posts)} posts; {len(unique)} unique. Style clustering finished.", flush=True)
    loadings = [dict(feature=name, pc1=float(pca.components_[0, i]), pc2=float(pca.components_[1, i]),
                     pc3=float(pca.components_[2, i]), clip_upper_99=float(upper[i])) for i, name in enumerate(names)]
    csv_write(out / "pca-loadings.csv", loadings)
    csv_write(out / "cluster-trials.csv", [dict(k=t["k"], silhouette=t["silhouette_mean"], ari=t["stability_ari"]) for t in trials])
    cluster_summaries = []
    for k in range(km.n_clusters):
        ids = np.flatnonzero(labels == k)
        order = ids[np.argsort(np.linalg.norm(z[ids] - km.cluster_centers_[k], axis=1))]
        top_features = sorted(zip(names, km.cluster_centers_[k]), key=lambda t: abs(t[1]), reverse=True)[:8]
        cluster_summaries.append(dict(cluster=k, unique_posts=len(ids),
            top_standardized_features=[dict(feature=a, deviation=float(b)) for a, b in top_features],
            representative_ids=[unique[i]["id"] for i in order[:5]],
            representative_lines=[unique[i]["start_line"] for i in order[:5]],
            statistics=summarize([texts[i] for i in ids]),
            years=dict(collections.Counter(str(unique[i]["year"]) if unique[i]["year"] is not None else "non_gregorian" for i in ids))))
    vectors, vector_models, neighbor_rows = {}, {}, []
    modes = {
        "lexical": lambda t: t,
        "script_masked": script_mask,
        "without_punctuation": lambda t: re.sub(r"[\s。、，．.!！?？…‥「」『』（）()【】\[\]：:；;]+", "", t),
    }
    for mode, transform in modes.items():
        vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 4), min_df=2, max_features=12000,
                                     sublinear_tf=True, lowercase=False, dtype=np.float64)
        mat = vectorizer.fit_transform([transform(t) for t in texts])
        probe_mat = vectorizer.transform([transform(p["text"]) for p in probes])
        centroid = normalize(np.asarray(mat.mean(axis=0)))
        sims = (probe_mat @ mat.T).toarray()
        lengths = np.array([len(re.sub(r"\s", "", t)) for t in texts])
        rows = []
        for i, probe in enumerate(probes):
            n = len(re.sub(r"\s", "", probe["text"]))
            eligible = np.flatnonzero((lengths >= max(1, n * .5)) & (lengths <= n * 2))
            best = int(np.argmax(sims[i]))
            matched = int(eligible[np.argmax(sims[i, eligible])]) if len(eligible) else None
            rows.append(dict(id=probe["id"], centroid_cosine=float((probe_mat[i] @ centroid.T)[0, 0]),
                nearest_id=unique[best]["id"], nearest_cosine=float(sims[i, best]),
                length_matched_id=unique[matched]["id"] if matched is not None else None,
                length_matched_cosine=float(sims[i, matched]) if matched is not None else None,
                eligible_posts=len(eligible), oov_vector=probe_mat[i].nnz == 0))
            neighbor_rows.append(dict(mode=mode, probe_id=probe["id"], probe_text=probe["text"],
                                     neighbor_id=unique[best]["id"], cosine=float(sims[i, best]),
                                     neighbor_line=unique[best]["start_line"], neighbor_text=texts[best]))
        vectors[mode] = rows
        vector_models[mode] = dict(features=len(vectorizer.vocabulary_), vocabulary_sha256=hashlib.sha256(
            json.dumps(vectorizer.get_feature_names_out().tolist(), ensure_ascii=False).encode()).hexdigest())
        if mode == "lexical":
            svd = TruncatedSVD(n_components=48, random_state=SEED).fit(mat)
            latent = normalize(svd.transform(mat))
            lexical_km = KMeans(n_clusters=km.n_clusters, n_init=20, random_state=SEED).fit(latent)
            topic_terms = []
            vocabulary = vectorizer.get_feature_names_out()
            for k in range(km.n_clusters):
                ids = np.flatnonzero(lexical_km.labels_ == k)
                mean = np.asarray(mat[ids].mean(axis=0)).ravel()
                topic_terms.append(dict(cluster=k, posts=len(ids), terms=vocabulary[np.argsort(mean)[-15:][::-1]].tolist()))
            lexical_info = dict(svd_explained_variance=float(svd.explained_variance_ratio_.sum()),
                style_cluster_ari=float(adjusted_rand_score(labels, lexical_km.labels_)), topics=topic_terms)
            # Flag near duplicates for sensitivity/audit, not training-quality labels.
            corpus_sims = (mat @ mat.T).toarray()
            a, b = np.where(np.triu(corpus_sims, 1) >= .95)
            near_pairs = [dict(left=unique[i]["id"], right=unique[j]["id"], cosine=float(corpus_sims[i,j]))
                          for i,j in zip(a,b) if min(lengths[i], lengths[j]) >= 40]
        print(f"Vector space {mode} complete.", flush=True)
    csv_write(out / "nearest-neighbors.csv", neighbor_rows)
    csv_write(out / "post-features.csv", [dict(id=p["id"], line=p["start_line"], year=p["year"], section=p["section"],
              cluster=int(labels[p["unique_index"]]), pc1=float(pc[p["unique_index"], 0]), pc2=float(pc[p["unique_index"], 1]),
              **features(p["text"])) for p in posts])
    csv_write(out / "probe-features.csv", [dict(**p, kind="input" if i < len(input_rows) else "generated",
              cluster=int(km.predict(zp[i:i+1])[0]), pc1=float(pp[i,0]), pc2=float(pp[i,1]), **features(p["text"]))
              for i, p in enumerate(probes)])
    groups = dict(all_raw_posts=summarize([p["text"] for p in posts]), unique_raw_posts=summarize(texts),
        narration_only=summarize([p["narration_text"] for p in posts if p["narration_text"].strip()]),
        archived_posts=summarize([p["content"] for p in archive["posts"]]),
        inputs=summarize([p["text"] for p in input_rows]), generated=summarize([p["text"] for p in output_rows]))
    for year in sorted({p["year"] for p in posts if p["year"] is not None}):
        groups[f"year_{year}"] = summarize([p["text"] for p in posts if p["year"] == year])
    groups["year_non_gregorian"] = summarize([p["text"] for p in posts if p["year"] is None])
    for low, high in [(1,39),(40,99),(100,249),(250,99999)]:
        groups[f"chars_{low}_{high}"] = summarize([p["text"] for p in posts if low <= measures(p["text"])["chars"] <= high])
    groups["without_flagged_sections"] = summarize([p["text"] for p in posts if not p["source_caution"]])
    for low, high in [(12990,13006),(13773,13799),(15000,15021)]:
        groups[f"reference_lines_{low}_{high}"] = summarize([p["text"] for p in posts if low <= p["header_line"] <= high])
    # Same symbol sequence vs same counts: distinguish unchanged layout from density dilution by added words.
    signature = lambda t: "".join(c for c in t if c in "。、，．.!！?？…‥「」『』（）()【】[]：:；;―—\n")
    unchanged = sum(signature(p["text"]) == signature(input_rows[p["input_index"]]["text"]) for p in output_rows)
    expression_context = []
    for expression in ("んだが", "からな", "ここ大事"):
        for group, rows in (("original", posts), ("generated", output_rows)):
            counts = collections.Counter()
            examples = []
            for p in rows:
                t = p["text"]
                for match in re.finditer(expression, t):
                    following = t[match.end():]
                    category = "end_of_post" if not following.strip() else "period" if following.startswith("。") else "newline" if following.startswith("\n") else "comma" if following.startswith(("、", ",", "，")) else "question_exclaim" if following[0] in "!?！？" else "continuation"
                    counts[category] += 1
                    if len(examples) < 18:
                        examples.append(dict(id=p["id"], line=p.get("start_line"), context=t[max(0,match.start()-35):match.end()+65], following=category))
            expression_context.append(dict(expression=expression, group=group, counts=dict(counts), examples=examples,
                scope="literal substring, not a morphological ending label; からな includes わからない"))
    # Equal input weight; outputs from the same source are not independent observations.
    cosine_summary = {}
    for mode, rows in vectors.items():
        deltas = []
        source_means, output_means = [], []
        for i, source in enumerate(input_rows):
            positions = [len(input_rows)+j for j,p in enumerate(output_rows) if p["input_index"] == i]
            if positions:
                before = rows[i]["centroid_cosine"]
                after = float(np.mean([rows[j]["centroid_cosine"] for j in positions]))
                source_means.append(before); output_means.append(after); deltas.append(after-before)
        rng = np.random.default_rng(SEED)
        boot = np.mean(rng.choice(deltas, (5000, len(deltas)), replace=True), axis=1)
        cosine_summary[mode] = dict(generated_inputs=len(deltas), input_mean=float(np.mean(source_means)),
            generated_mean=float(np.mean(output_means)), paired_delta=float(np.mean(deltas)),
            descriptive_bootstrap_95=np.quantile(boot,[.025,.975]).tolist())
    # Original-only fitting, with per-generation length-matched reference statistics.
    length_matches = []
    original_lengths = [measures(t)["chars"] for t in texts]
    for p in output_rows:
        n = measures(p["text"])["chars"]
        subset = [t for t, length in zip(texts, original_lengths) if .5*n <= length <= 2*n]
        length_matches.append(dict(id=p["id"], input_index=p["input_index"], reference=summarize(subset), output=measures(p["text"])))
    write_json(out / "length-matched-comparison.json", length_matches)
    write_json(out / "vectors.json", dict(models=vector_models, results=vectors, summary=cosine_summary))
    write_json(out / "expression-contexts.json", expression_context)
    write_json(out / "near-duplicates.json", near_pairs)
    # Verify previously generated outputs still describe the current generation-source files.
    prior = json.loads((ROOT / "artifacts/full-log-reread/generation-tested-files.json").read_text(encoding="utf-8-sig"))
    actual = {path:sha(ROOT / path) for path in prior}
    assert actual == prior, "Current generation code differs from the saved output fixture"
    provenance = dict(output_engine=generated["engine"], previous_source_hash_record=prior,
                      current_source_hashes=actual, generation_sources_match=True)
    manifest = dict(raw_path=str(args.log), raw_sha256=hashlib.sha256(raw_bytes).hexdigest(), raw_bytes=len(raw_bytes),
        line_segments=len(lines), physical_lines=len(raw.splitlines()), nonempty_lines=sum(bool(t.strip()) for t in lines),
        categories=dict(collections.Counter(x["category"] for x in ledger)), posts=post_count,
        analyzed_nonempty_posts=len(posts), empty_or_anchor_only_posts=[p["id"] for p in empty_posts], exact_unique_posts=len(unique),
        duplicate_posts=len(posts)-len(unique), flagged_source_posts=sum(p["source_caution"] for p in posts),
        embedded_quote_headers=sorted(EMBEDDED_HEADERS),
        non_gregorian_header_lines=[p["header_line"] for p in posts if p["year"] is None],
        raw_punctuation=dict(collections.Counter(c for c in raw if c in PUNCT or c == "\n")),
        archive_sha256=sha(archive_path), generated_sha256=sha(generated_path), script_sha256=sha(__file__),
        versions={name:importlib.metadata.version(name) for name in ("numpy","scipy","scikit-learn","matplotlib")},
        style_features=names, seed=SEED, original_only_fitting=True, quote_mask="Japanese brackets and > block lines only; parentheses retained",
        constant_features_after_clipping=[names[i] for i in range(len(names)) if scaler.var_[i] == 0],
        authorship_labels_available=False, human_ratings_submitted=False, provenance=provenance)
    report = dict(manifest=manifest, groups=groups, punctuation_signature_preserved=dict(unchanged=unchanged,total=len(output_rows)),
        pca=dict(explained_variance=pca.explained_variance_ratio_.tolist(),
                 pc1_length_spearman=float(spearmanr(pc[:,0], x[:,0]).statistic),
                 pc2_length_spearman=float(spearmanr(pc[:,1], x[:,0]).statistic)),
        pca_without_explicit_length=dict(explained_variance=pca_no_length.explained_variance_ratio_.tolist(),
            pc1_length_spearman=float(spearmanr(pc_no_length[:,0], x[:,0]).statistic),
            pc2_length_spearman=float(spearmanr(pc_no_length[:,1], x[:,0]).statistic)),
        clustering=dict(selected_k=km.n_clusters,trials=trials,clusters=cluster_summaries,
            no_explicit_length_ari=float(adjusted_rand_score(labels,no_length.labels_)),
            no_clipping_ari=float(adjusted_rand_score(labels,unclipped_km.labels_))),
        lexical_svd=lexical_info, cosine=cosine_summary, near_duplicate_pairs=len(near_pairs),
        expression_counts=[{k:v for k,v in e.items() if k != "examples"} for e in expression_context])
    write_json(out / "report.json", report)
    write_json(out / "manifest.json", manifest)
    make_plots(out, pc, pp, labels, unique, len(input_rows), pca, groups, names, km, trials)
    make_length_ablation_plot(out, pc_no_length, pp_no_length, len(input_rows), pca_no_length)
    make_report(out, report, posts, unique, vectors, probes)
    assert sha(args.log) == manifest["raw_sha256"], "Raw log changed during analysis"
    print(json.dumps({"output":str(out),"categories":manifest["categories"],"posts":len(posts),
        "clusters":km.n_clusters,"punctuation_preserved":unchanged,"cosine":cosine_summary},ensure_ascii=False),flush=True)


def make_plots(out, pc, pp, labels, posts, n_inputs, pca, groups, names, km, trials):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    font = Path("C:/Windows/Fonts/YuGothM.ttc")
    if font.exists():
        font_manager.fontManager.addfont(str(font))
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=str(font)).get_name()
    plt.rcParams.update({"font.size":10,"axes.spines.top":False,"axes.spines.right":False,"svg.fonttype":"none"})
    fig, axes = plt.subplots(1,2,figsize=(14,6), layout="constrained")
    axes[0].scatter(pc[:,0],pc[:,1],c=labels,cmap="tab10",s=12,alpha=.45)
    axes[0].set_title("原文だけで学習した文体特徴のPCA／色＝探索的クラスタ")
    axes[1].scatter(pc[:,0],pc[:,1],c="#b9c3ce",s=10,alpha=.32,label="原文・完全重複除外")
    axes[1].scatter(pp[:n_inputs,0],pp[:n_inputs,1],c="#007f89",s=35,marker="+",label="入力37件")
    axes[1].scatter(pp[n_inputs:,0],pp[n_inputs:,1],c="#cb492c",s=28,marker="x",label="生成75件")
    axes[1].legend(); axes[1].set_title("同じ座標への投影（近さは品質判定ではない）")
    for ax in axes:
        ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]*100:.1f}%)")
        ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]*100:.1f}%)")
    fig.savefig(out / "pca.png",dpi=170); fig.savefig(out / "pca.svg"); plt.close(fig)
    selected=[("all_raw_posts","原文全投稿"),("year_2002","2002年"),("year_2003","2003年"),
              ("year_2005","2005年"),("inputs","入力"),("generated","生成")]
    fig,axes=plt.subplots(1,3,figsize=(14,5),layout="constrained")
    for ax,key,title,mult in zip(axes,["period_per_100","newline_per_100","final_period_posts"],
        ["句点「。」／100文字","改行／100文字","投稿末尾が「。」（%）"],[1,1,100]):
        ax.barh([s[1] for s in selected],[groups[s[0]][key]*mult for s in selected],color=["#738ba2"]*4+["#007f89","#cb492c"])
        ax.set_title(title);ax.invert_yaxis()
    fig.savefig(out / "punctuation.png",dpi=170); fig.savefig(out / "punctuation.svg");plt.close(fig)
    fig,axes=plt.subplots(1,2,figsize=(13,5),layout="constrained")
    axes[0].plot([t["k"] for t in trials],[t["silhouette_mean"] for t in trials],"o-")
    axes[0].set(xlabel="k",ylabel="Silhouette (sample <= 1,200)",title="クラスタ数の比較：値が低ければ分離は弱い")
    for axis,component in [(axes[1],0)]:
        idx=np.argsort(np.abs(pca.components_[component]))[-10:]
        axis.barh([names[i] for i in idx],pca.components_[component,idx],color="#738ba2")
        axis.set_title("PC1の主な負荷量（符号自体に優劣はない）")
    fig.savefig(out / "diagnostics.png",dpi=170);fig.savefig(out / "diagnostics.svg");plt.close(fig)


def make_report(out, r, posts, unique, vectors, probes):
    # An editable analysis note follows once the numeric and representative-post results are inspected.
    esc=html.escape
    sections=[]
    sections.append('<h1>原文全文・句読点・文体解析</h1><p>原文を全件集計し、原文だけで作った特徴空間に入力・生成文を投影。本人認定・自然さの合格判定ではありません。</p>')
    sections.append('<p><strong>結論：語句の置換では、原文の改行と文のつながりを再現できていません。</strong>原文の82.6%には「。」「、」がない一方、保存済み生成75件は全件が句点で終わります。入力と生成で句読点・改行の並びが75/75件そのままでした。</p><p>「んだが」の直後が「。」になる文字列は原文199例中2例、生成25例中25例。原文の多くは、ここで次の節や次の行に続いています。終助詞風に置換して句点を残す処理に、具体的なずれがあります。</p>')
    sections.append('<p>元ログSHA-256: <code>'+r['manifest']['raw_sha256']+'</code></p>')
    sections.append('<h2>対象と検証範囲</h2><pre>'+esc(json.dumps({k:r['manifest'][k] for k in ['line_segments','physical_lines','categories','posts','exact_unique_posts','flagged_source_posts']},ensure_ascii=False,indent=2))+'</pre>')
    sections.append('<p>投稿ヘッダ2,407件のうち、空の投稿と返信番号のみの投稿を除いた2,405件を解析。完全重複をまとめた2,363件から特徴空間を作りました。全体は複数話者の収録で真作ラベルは未検証。初期投稿、模倣、引用を含みます。引用ヘッダは5702・11033・12238・15647行を確認して分離。「天晶暦968」の2投稿は西暦不明として保存しています。</p>')
    sections.append('<h2>句読点と改行</h2><img src="punctuation.png" alt="句読点・改行・末尾句点の比較">')
    sections.append('<p>生成文の句読点・改行の並びが入力と同じ: '+str(r['punctuation_signature_preserved']['unchanged'])+'/'+str(r['punctuation_signature_preserved']['total'])+'。文字が増えて100文字あたりの句点が減っても、構成が改善したことにはなりません。</p>')
    sections.append('<table><tr><th>集計層</th><th>投稿数</th><th>文字数中央値</th><th>句点/100字</th><th>読点/100字</th><th>改行/100字</th><th>句読点なし投稿%</th><th>末尾句点%</th></tr>')
    for name,g in r['groups'].items():
        if not g['posts']:continue
        sections.append(f'<tr><td>{esc(name)}</td><td>{g["posts"]}</td><td>{g["median_chars"]:.1f}</td><td>{g["period_per_100"]:.2f}</td><td>{g["comma_per_100"]:.2f}</td><td>{g["newline_per_100"]:.2f}</td><td>{100*g["no_jp_punct_posts"]:.1f}</td><td>{100*g["final_period_posts"]:.1f}</td></tr>')
    sections.append('</table><h2>PCAとクラスタリング</h2><img src="pca.png" alt="原文の主成分座標と生成文の投影"><img src="diagnostics.png" alt="クラスタ分離とPCA負荷量">')
    sections.append('<p>最初の2軸が説明する分散は23.9%。PC1と文字数の順位相関は0.913で、長さの影響が強い図です。5クラスタのシルエット平均は0.123と分離が弱く、「本物度の5段階」にはできません。初期値を変えた一致度は高いものの、長さ4特徴を外すとARIは0.324まで変わります。</p><h3>長さ4特徴を除いた再解析</h3><img src="pca-without-length.png" alt="長さの直接特徴を除いたPCA"><p>文字数・行数・平均行長・最大行長を除いた29特徴でも再計算しました。比率特徴にはなお長さの影響が残るため、長さの完全な補正ではありません。</p>')
    sections.append('<p>33個の構造・表記・機能表現の特徴。原文の99パーセンタイルで上側をクリップし標準化。PCAは元の全特徴で実行、クラスタは2次元図ではなく全標準化特徴で推定。K=2〜8、乱数3種、各10初期値。語彙TF-IDFには別途TruncatedSVD（PCAとは別）を使用。</p>')
    sections.append('<pre>'+esc(json.dumps({k:r['clustering'][k] for k in ['selected_k','trials','no_explicit_length_ari','no_clipping_ari']},ensure_ascii=False,indent=2))+'</pre>')
    lookup={p['id']:p for p in unique}
    for cluster in r['clustering']['clusters']:
        labels={0:'短い疑問・「べ？」型',1:'比較的長い説明・叙述',2:'句点を使わない短い応答',3:'句点・読点を多く使う文章',4:'数値・空白の多い性能表など'}
        sections.append(f'<h3>クラスタ {cluster["cluster"]}：{cluster["unique_posts"]}件 — {labels[cluster["cluster"]]}</h3><p>'+esc(', '.join(f'{t["feature"]}: {t["deviation"]:+.2f}' for t in cluster['top_standardized_features']))+'</p>')
        for pid in cluster['representative_ids'][:3]:
            p=lookup[pid]
            sections.append(f'<details><summary>{pid} / {p["year"]} / {esc(p["section"])} / 原文{p["start_line"]}–{p["end_line"]}行</summary><pre>{esc(p["text"])}</pre></details>')
    sections.append('<h2>コサイン比較</h2><p>文字2〜4-gram TF-IDF、最大12,000特徴、min_df=2。raw、文字種マスク、句読点・空白除去の3空間。生成できた入力ごとに候補を平均してから比較。区間は32入力の記述的ブートストラップで、未知入力への性能保証ではありません。</p><pre>'+esc(json.dumps(r['cosine'],ensure_ascii=False,indent=2))+'</pre>')
    sections.append('<p>元の入力から生成文への平均コサインは上がりました。しかし、句読点を除いた空間でも上がるため、句読点が改善した証拠にはなりません。語彙空間の群と文体特徴の群の一致度はARI 0.184。語彙ではロト・侍・グラットンなどの話題が強く分かれます。この結果と、以前の別コーパス・別特徴数の点数は直接比較できません。</p>')
    sections.append('<h2>特定文字列の後ろに何が来るか</h2><p>形態素による語尾認定ではなく文字列の全出現です。「からな」には「わからない」なども含まれるため、語尾の使用率とは解釈しません。</p><pre>'+esc(json.dumps(r['expression_counts'],ensure_ascii=False,indent=2))+'</pre>')
    sections.append('<h2>方法と限界</h2><ul><li>全行をline-ledger.csvに分類し、本文と見出しを分離。返信番号だけの行は投稿ベクトルから除外。</li><li>完全重複を除いて空間を学習。近似重複は検出して一覧化し、未除去の依存性として扱う。</li><li>「」『』と引用行を外した句読点集計もJSONに保存。括弧は自己注釈を含むため保持。これは構文解析による話者分離ではない。</li><li>コサインは話題・長さ・頻出句でも上がる。マスク後の近さも意味保持・自然さ・本人らしさを保証しない。</li><li>PCAの2軸外にも差は残る。クラスタ番号は作者や本物度ではない。</li><li>生成例は以前の37入力・75出力の固定標本。全文一般の生成能力を代表する無作為標本ではない。人間評価は未実施。</li><li>句点の一律削除は検証していない。本文の意味区切り、引用、疑問、数値、URLを保持した構成変更が必要。</li></ul>')
    sections.append('<h2>再現・全件データ</h2><p><a href="report.json">統計JSON</a> / <a href="post-features.csv">全投稿特徴</a> / <a href="line-ledger.csv">全行台帳</a> / <a href="nearest-neighbors.csv">生成・入力の近傍と原文</a> / <a href="pca-loadings.csv">PCA負荷量</a> / <a href="length-matched-comparison.json">長さを合わせた比較</a></p>')
    doc='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>原文全文解析</title><style>body{font:16px/1.8 "Yu Gothic",sans-serif;max-width:1180px;margin:36px auto;padding:0 24px;color:#202b38;background:#fafbfc}h1,h2{line-height:1.4}h2{margin-top:48px}img{width:100%;background:white}table{border-collapse:collapse;font-size:13px;display:block;overflow:auto}td,th{padding:8px 12px;border-bottom:1px solid #ccd3dc;text-align:right;white-space:nowrap}td:first-child{text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef1f5;padding:16px;font:13px/1.7 monospace}details{margin:12px 0}summary{cursor:pointer}code{overflow-wrap:anywhere}</style>'+''.join(sections)+'</html>'
    (out/'report.html').write_text(doc,encoding='utf-8')


def make_length_ablation_plot(out, pc, pp, n_inputs, pca):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(10,6), layout="constrained")
    ax.scatter(pc[:,0],pc[:,1],c="#b9c3ce",s=10,alpha=.35,label="原文・完全重複除外")
    ax.scatter(pp[:n_inputs,0],pp[:n_inputs,1],c="#007f89",s=35,marker="+",label="入力37件")
    ax.scatter(pp[n_inputs:,0],pp[n_inputs:,1],c="#cb492c",s=28,marker="x",label="生成75件")
    ax.legend()
    ax.set(xlabel=f"PC1 ({pca.explained_variance_ratio_[0]*100:.1f}%)",
           ylabel=f"PC2 ({pca.explained_variance_ratio_[1]*100:.1f}%)",
           title="長さ4特徴を除いた29特徴でのPCA（比率には長さの影響が残る）")
    fig.savefig(out / "pca-without-length.png",dpi=170)
    fig.savefig(out / "pca-without-length.svg")
    plt.close(fig)


if __name__ == "__main__":
    with threadpool_limits(limits=1):
        main()
