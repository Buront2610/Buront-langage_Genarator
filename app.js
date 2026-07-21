(function bootstrap() {
  "use strict";

  const STORAGE_KEYS = {
    dictionary: "buront-generator.dictionary",
    contextMode: "buront-generator.context-mode",
    series: "buront-generator.series",
    input: "buront-generator.input",
    level: "buront-generator.level",
    theme: "buront-generator.theme",
  };

  const samples = {
    work: "昨日、仕事で急いで資料を提出したら、上司がとても驚きました。",
    game: "このプレイヤーはスキルが高く、相手には絶対に負けないでしょう。",
    daily: "もう手遅れです。あまりにもずるいので、私は怒っています。",
  };

  const elements = {
    changeCount: document.querySelector("#changeCount"),
    clearButton: document.querySelector("#clearButton"),
    comparisonList: document.querySelector("#comparisonList"),
    comparisonPanel: document.querySelector("#comparisonPanel"),
    contextModeButtons: Array.from(document.querySelectorAll("[data-context-mode]")),
    convertButton: document.querySelector("#convertButton"),
    copyButton: document.querySelector("#copyButton"),
    corpusComparisonStat: document.querySelector("#corpusComparisonStat"),
    corpusEraStat: document.querySelector("#corpusEraStat"),
    corpusLogStat: document.querySelector("#corpusLogStat"),
    corpusNovelStat: document.querySelector("#corpusNovelStat"),
    corpusQuoteStat: document.querySelector("#corpusQuoteStat"),
    customDictionary: document.querySelector("#customDictionary"),
    dictionaryStatus: document.querySelector("#dictionaryStatus"),
    emptyOutput: document.querySelector("#emptyOutput"),
    engineStatus: document.querySelector("#engineStatus"),
    seriesSelect: document.querySelector("#seriesSelect"),
    inputCount: document.querySelector("#inputCount"),
    inputText: document.querySelector("#inputText"),
    levelButtons: Array.from(document.querySelectorAll("[data-level]")),
    outputCount: document.querySelector("#outputCount"),
    outputText: document.querySelector("#outputText"),
    resultArea: document.querySelector("#resultArea"),
    sampleButtons: Array.from(document.querySelectorAll("[data-sample]")),
    suggestionList: document.querySelector("#suggestionList"),
    techniqueList: document.querySelector("#techniqueList"),
    themeButton: document.querySelector("#themeButton"),
    toast: document.querySelector("#toast"),
    verificationSummary: document.querySelector("#verificationSummary"),
  };

  let selectedLevel = 2;
  let selectedContextMode = "faithful";
  let selectedSeries = "all";
  let toastTimer;
  let engineReady = false;
  const originalConvertLabel = "ブロント語に変換";
  const seriesLabels = {
    all: "全系列",
    roto: "ロト時代＋暗黒騎士系",
    yorusama: "グラットンスレ系",
    saiko: "最高の騎士系",
    night: "名無し系（2003～2004）",
    puronohito: "鯖スレ系",
    nega: "ネガ侍系",
    katuru: "謙虚な騎士系",
    gg: "ギルティギア系",
    sonota: "その他",
  };

  function readStorage(key, fallback = "") {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Browser storage is optional.
    }
  }

  function parseDictionary(value) {
    return value
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) return null;
        return {
          from: line.slice(0, separator).trim(),
          to: line.slice(separator + 1).trim(),
        };
      })
      .filter((rule) => rule && rule.from && rule.to);
  }

  function percent(value) {
    return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
  }

  function updateInputCount() {
    elements.inputCount.textContent = `${elements.inputText.value.length.toLocaleString("ja-JP")}文字`;
  }

  function setLevel(level) {
    selectedLevel = Number(level);
    elements.levelButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.level) === selectedLevel));
    });
    writeStorage(STORAGE_KEYS.level, String(selectedLevel));
  }

  function setContextMode(mode) {
    selectedContextMode = mode === "full" ? "full" : "faithful";
    elements.contextModeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.contextMode === selectedContextMode));
    });
    writeStorage(STORAGE_KEYS.contextMode, selectedContextMode);
  }

  function setSeries(series) {
    selectedSeries = Object.hasOwn(seriesLabels, series) ? series : "all";
    elements.seriesSelect.value = selectedSeries;
    writeStorage(STORAGE_KEYS.series, selectedSeries);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
  }

  function resizeOutput() {
    elements.outputText.style.height = "auto";
    elements.outputText.style.height = `${Math.max(255, elements.outputText.scrollHeight)}px`;
  }

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderDiff(container, operations, mode) {
    for (const operation of operations) {
      if (mode === "source" && operation.type === "added") continue;
      if (mode === "output" && operation.type === "removed") continue;
      const span = document.createElement("span");
      span.textContent = operation.value;
      if (operation.type !== "same") span.className = `diff-${operation.type}`;
      container.append(span);
    }
  }

  function renderScoreList(validation) {
    const list = makeElement("dl", "validation-scores");
    const values = [
      ["総合", validation.total],
      ["意味保持", validation.semantic],
      ["実ログ近似", validation.logAffinity],
      ["長文近似", validation.novelAffinity],
      ["接続品質", validation.fluency],
    ];
    if (Number.isFinite(validation.seriesVectorRank)) {
      values.splice(3, 0, ["指定系列cos", validation.seriesVectorCosine]);
    }
    if (validation.narrativeScore !== undefined) values.splice(4, 0, ["自慢話構造", validation.narrativeScore]);
    for (const [label, value] of values) {
      const item = document.createElement("div");
      item.append(makeElement("dt", "", label), makeElement("dd", "", percent(value)));
      list.append(item);
    }
    return list;
  }

  function renderReferences(references) {
    const details = makeElement("details", "reference-details");
    details.append(makeElement("summary", "", `参照した実ログ ${references.length}件`));
    const list = makeElement("div", "reference-list");
    for (const reference of references) {
      const item = makeElement("article", "reference-item");
      const cosineLabel = Number.isFinite(reference.cosineSimilarity)
        ? ` / 意味cos ${reference.cosineSimilarity.toFixed(3)}`
        : "";
      const meta = makeElement("p", "reference-meta", `${reference.board} / ${reference.threadTitle}${cosineLabel}`);
      const quote = makeElement("blockquote", "", reference.text);
      item.append(meta, quote);
      if (reference.postUrl) {
        const link = makeElement("a", "reference-link", "投稿元を開く");
        link.href = reference.postUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        item.append(link);
      }
      list.append(item);
    }
    details.append(list);
    return details;
  }

  function renderAlternatives(alternatives) {
    const details = makeElement("details", "alternative-details");
    details.append(makeElement("summary", "", `比較した上位候補 ${alternatives.length}件`));
    const list = makeElement("ol", "alternative-list");
    for (const alternative of alternatives) {
      const item = document.createElement("li");
      item.append(
        makeElement("p", "", alternative.text),
        makeElement("span", "", `総合 ${percent(alternative.total)} / 意味 ${percent(alternative.semantic)} / 文体 ${percent(alternative.style)}`),
      );
      list.append(item);
    }
    details.append(list);
    return details;
  }

  function renderSuggestions(suggestions) {
    elements.suggestionList.replaceChildren();
    if (!suggestions?.length) return;

    const heading = makeElement("div", "suggestion-heading");
    heading.append(
      makeElement("h3", "", `検証通過候補 ${suggestions.length}案`),
      makeElement("span", "", "今回の抽選"),
    );
    elements.suggestionList.append(heading);

    suggestions.forEach((suggestion, index) => {
      const article = makeElement("article", `suggestion-item${index === 0 ? " is-selected" : ""}`);
      const header = makeElement("div", "suggestion-item-header");
      header.append(
        makeElement("strong", "", `案 ${index + 1}`),
        makeElement("span", index === 0 ? "suggestion-adopted" : "", index === 0 ? "採用" : `総合 ${percent(suggestion.averageTotal)}`),
      );
      const candidateText = makeElement("p", "suggestion-text", suggestion.text);
      const footer = makeElement("div", "suggestion-footer");
      footer.append(makeElement("span", "", `意味 ${percent(suggestion.averageSemantic)} / 文体 ${percent(suggestion.averageStyle)}`));
      const copy = makeElement("button", "suggestion-copy", "この案をコピー");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(suggestion.text);
          copy.textContent = "コピー済み";
          showToast(`案 ${index + 1}をコピーしました。`);
          window.setTimeout(() => { copy.textContent = "この案をコピー"; }, 1400);
        } catch {
          showToast("コピーできませんでした。文章を選択してコピーしてください。");
        }
      });
      footer.append(copy);
      article.append(header, candidateText, footer);
      elements.suggestionList.append(article);
    });
  }

  function renderComparisons(result) {
    elements.comparisonList.replaceChildren();
    result.comparisons.forEach((comparison, index) => {
      const article = makeElement("article", "comparison-item");
      const header = makeElement("div", "comparison-item-heading");
      header.append(
        makeElement("h3", "", comparison.unit === "paragraph" ? "段落全体" : `文 ${index + 1}`),
        makeElement(
          "span",
          comparison.validation.passed ? "verification-pass" : "verification-warning",
          comparison.validation.passed ? "検証通過" : "要確認",
        ),
      );

      const pair = makeElement("div", "sentence-pair");
      const sourceBox = makeElement("div", "sentence-box");
      sourceBox.append(makeElement("h4", "", "入力文"));
      const sourceText = makeElement("p", "diff-text");
      renderDiff(sourceText, comparison.diff, "source");
      sourceBox.append(sourceText);

      const outputBox = makeElement("div", "sentence-box");
      outputBox.append(makeElement("h4", "", "採用文"));
      const outputText = makeElement("p", "diff-text");
      renderDiff(outputText, comparison.diff, "output");
      outputBox.append(outputText);
      pair.append(sourceBox, outputBox);

      const verification = makeElement("div", "verification-body");
      verification.append(renderScoreList(comparison.validation));
      const functionalEvidence = comparison.validation.quoteFunctionalRoles?.length
        ? ` / 展開機能 ${comparison.validation.quoteFunctionalRoles.join("、")}`
        : comparison.validation.faithfulQuoteRoles?.length
          ? ` / 機能 ${comparison.validation.faithfulQuoteRoles.join("、")}`
          : "";
      const corpusEvidence = result.contextMode === "faithful"
        ? Array.from(new Set((comparison.validation.faithfulQuoteEvidence || []).flatMap((entry) => entry.observed))).join("、")
        : "";
      const evidenceLabel = corpusEvidence ? ` / コーパス根拠 ${corpusEvidence}` : "";
      const vectorEvidence = Number.isFinite(comparison.validation.seriesVectorRank)
        ? ` / 指定系列は9系列中${comparison.validation.seriesVectorRank}位（重心＋近傍cos）`
        : "";
      const facts = makeElement("p", "verification-facts", `${comparison.candidateCount}候補を比較 / ${comparison.verificationPasses}回検証${functionalEvidence}${evidenceLabel}${vectorEvidence}`);
      verification.append(facts);

      if (comparison.validation.warnings.length) {
        const warnings = makeElement("ul", "warning-list");
        comparison.validation.warnings.forEach((warning) => warnings.append(makeElement("li", "", warning)));
        verification.append(warnings);
      }

      article.append(header, pair, verification);
      if (comparison.references.length) article.append(renderReferences(comparison.references));
      if (comparison.alternatives.length) article.append(renderAlternatives(comparison.alternatives));
      elements.comparisonList.append(article);
    });

    const summary = result.summary;
    const unit = summary.unit === "paragraph" ? "段落" : "文";
    elements.verificationSummary.textContent = `${summary.passedCount}/${summary.sentenceCount}${unit}が検証通過、合計${summary.verificationPasses}回検証`;
    elements.comparisonPanel.hidden = false;
  }

  function renderResult(result) {
    elements.outputText.value = result.text;
    elements.outputCount.textContent = `${result.text.length.toLocaleString("ja-JP")}文字`;
    const unit = result.summary.unit === "paragraph" ? "段落" : "文";
    elements.changeCount.textContent = `${result.summary.sentenceCount}${unit}を比較・検証`;
    elements.techniqueList.replaceChildren();

    const scores = [
      `総合 ${percent(result.summary.averageTotal)}`,
      `意味保持 ${percent(result.summary.averageSemantic)}`,
      `ブロント語らしさ ${percent(result.summary.averageStyle)}`,
      `接続品質 ${percent(result.summary.averageFluency)}`,
      "LLM不使用",
      "TF-IDF・コサイン検索",
      seriesLabels[result.series] || seriesLabels.all,
    ];
    if (result.contextMode === "full") {
      const validation = result.comparisons?.[0]?.validation;
      const quotePatternCount = validation?.quotePatternCount || 0;
      const anchorConstructionCount = validation?.anchorConstructionCount || 0;
      scores.push("文脈完全ブロントナイズ", `名言集展開 ${quotePatternCount}型・アンカー構文 ${anchorConstructionCount}型`);
    } else {
      const offeredFrames = new Set(result.comparisons.flatMap((comparison) => (
        (comparison.options || []).flatMap((option) => option.validation?.faithfulQuoteSignatures || [])
      )));
      scores.push(`原文寄り機能構文 ${offeredFrames.size}型を比較`);
    }
    scores.forEach((score) => elements.techniqueList.append(makeElement("span", "", score)));
    renderSuggestions(result.suggestions);

    elements.emptyOutput.hidden = true;
    elements.resultArea.hidden = false;
    elements.copyButton.disabled = false;
    renderComparisons(result);
    window.requestAnimationFrame(resizeOutput);
  }

  function clearResult() {
    elements.outputText.value = "";
    elements.emptyOutput.hidden = false;
    elements.resultArea.hidden = true;
    elements.comparisonPanel.hidden = true;
    elements.comparisonList.replaceChildren();
    elements.suggestionList.replaceChildren();
    elements.copyButton.disabled = true;
  }

  function setLoading(loading) {
    elements.convertButton.disabled = loading;
    elements.levelButtons.forEach((button) => { button.disabled = loading; });
    elements.contextModeButtons.forEach((button) => { button.disabled = loading; });
    elements.seriesSelect.disabled = loading;
    const kbd = elements.convertButton.querySelector("kbd");
    elements.convertButton.firstChild.textContent = loading ? "候補を比較・検証中 " : `${originalConvertLabel} `;
    if (kbd) kbd.hidden = loading;
  }

  async function convertText() {
    const input = elements.inputText.value;
    if (!input.trim()) {
      showToast("変換する文章を入力してください。");
      elements.inputText.focus();
      return;
    }
    if (!engineReady) {
      showToast("比較エンジンを利用できません。start.batから起動してください。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          level: selectedLevel,
          contextMode: selectedContextMode,
          series: selectedSeries,
          customRules: parseDictionary(elements.customDictionary.value),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "変換に失敗しました");
      renderResult(result);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    const value = elements.outputText.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      elements.outputText.removeAttribute("readonly");
      elements.outputText.select();
      document.execCommand("copy");
      elements.outputText.setAttribute("readonly", "");
      window.getSelection()?.removeAllRanges();
    }
    elements.copyButton.textContent = "コピー済み";
    showToast("ブロント語をコピーしました。");
    window.setTimeout(() => { elements.copyButton.textContent = "コピー"; }, 1400);
  }

  function applyTheme(theme) {
    const themes = { auto: "表示: 自動", dark: "表示: 暗い", light: "表示: 明るい" };
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    elements.themeButton.textContent = themes[theme] || themes.auto;
    writeStorage(STORAGE_KEYS.theme, theme);
  }

  function cycleTheme() {
    const current = readStorage(STORAGE_KEYS.theme, "auto");
    applyTheme(current === "auto" ? "dark" : current === "dark" ? "light" : "auto");
  }

  async function loadEngineStatus() {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const status = await response.json();
      if (!response.ok || !status.ready) throw new Error(status.error || "準備できていません");
      engineReady = true;
      elements.engineStatus.classList.add("is-ready");
      elements.engineStatus.lastChild.textContent = ` ${status.posts.toLocaleString("ja-JP")}投稿を比較可能`;
      elements.corpusLogStat.textContent = `${status.posts.toLocaleString("ja-JP")}投稿、${status.sentences.toLocaleString("ja-JP")}文`;
      elements.corpusQuoteStat.textContent = `${status.quoteHeadings.toLocaleString("ja-JP")}見出し、原ログ${status.quoteContextLinks.toLocaleString("ja-JP")}投稿と接続、完全モード${status.quotePatterns}展開型・${status.anchorConstructions}アンカー構文、原文寄り${status.faithfulQuoteExpressions}機能別構文・${status.faithfulQuoteFunctionalRoles}役割（根拠接続${status.faithfulQuoteEvidenceLinks}型）`;
      elements.corpusComparisonStat.textContent = `${status.comparisonStages}段階の改変差分`;
      elements.corpusNovelStat.textContent = `${status.novelChapters}話、${status.novelCharactersAnalyzed.toLocaleString("ja-JP")}文字を統計化`;
      const archiveSeries = status.series.filter((series) => series.id !== "all");
      const classifiedPosts = archiveSeries.reduce((sum, era) => sum + era.postCount, 0);
      elements.corpusEraStat.textContent = `${archiveSeries.length}系列、${classifiedPosts.toLocaleString("ja-JP")}投稿、系列構文${status.seriesGrammarFrames}型、系列ベクトル${status.seriesStyleVocabulary.toLocaleString("ja-JP")}語`;
    } catch {
      engineReady = false;
      elements.engineStatus.classList.add("has-error");
      elements.engineStatus.lastChild.textContent = " 比較エンジンに接続できません";
      elements.corpusLogStat.textContent = "start.batから起動してください";
    }
  }

  elements.levelButtons.forEach((button) => button.addEventListener("click", () => setLevel(button.dataset.level)));
  elements.contextModeButtons.forEach((button) => button.addEventListener("click", () => setContextMode(button.dataset.contextMode)));
  elements.seriesSelect.addEventListener("change", () => setSeries(elements.seriesSelect.value));
  elements.sampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      elements.inputText.value = samples[button.dataset.sample] || "";
      updateInputCount();
      writeStorage(STORAGE_KEYS.input, elements.inputText.value);
      elements.inputText.focus();
    });
  });
  elements.inputText.addEventListener("input", () => {
    updateInputCount();
    writeStorage(STORAGE_KEYS.input, elements.inputText.value);
  });
  elements.customDictionary.addEventListener("input", () => {
    const dictionary = elements.customDictionary.value;
    const ruleCount = parseDictionary(dictionary).length;
    writeStorage(STORAGE_KEYS.dictionary, dictionary);
    elements.dictionaryStatus.textContent = ruleCount
      ? `${ruleCount}件の追加ルールを保存しました。`
      : "この端末のブラウザ内にだけ保存されます。";
  });
  elements.convertButton.addEventListener("click", convertText);
  elements.copyButton.addEventListener("click", copyResult);
  elements.themeButton.addEventListener("click", cycleTheme);
  elements.clearButton.addEventListener("click", () => {
    elements.inputText.value = "";
    writeStorage(STORAGE_KEYS.input, "");
    updateInputCount();
    clearResult();
    elements.inputText.focus();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      convertText();
    }
  });

  const storedLevel = Number(readStorage(STORAGE_KEYS.level, "2"));
  elements.inputText.value = readStorage(STORAGE_KEYS.input, "");
  elements.customDictionary.value = readStorage(STORAGE_KEYS.dictionary, "");
  setLevel([1, 2, 3].includes(storedLevel) ? storedLevel : 2);
  setContextMode(readStorage(STORAGE_KEYS.contextMode, "faithful"));
  setSeries(readStorage(STORAGE_KEYS.series, readStorage("buront-generator.era", "all")));
  applyTheme(readStorage(STORAGE_KEYS.theme, "auto"));
  updateInputCount();
  loadEngineStatus();
})();
