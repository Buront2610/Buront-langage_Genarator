import React, { useEffect, useRef, useState } from 'react';
import { reviewChoices, reviewDimensions, type PublicReview, type ReviewRatings, type ReviewChoice } from '../../../packages/evaluation/review-types';

const choiceLabels: Record<ReviewChoice, string> = { left: '左がよい', right: '右がよい', tie: '同程度', both_bad: '両方だめ', cannot_judge: '判断できない' };
const prompts = { S: 'ブロント語の語り口に近いのは？', Q: '一句・文章として使いたいのは？', C: '原文の意味と状況に合っているのは？' };
const hints = { S: '語尾だけでなく、理屈の運び・言い回し・発話の調子を見てください。', Q: '面白さ、まとまり、くどさ、不自然さを見てください。', C: '人物、否定、数値、完了と予定を取り違えていないか見てください。' };
type Props = { api: (url: string, options?: RequestInit) => Promise<any> };
export function ReviewPanel({ api }: Props) {
  const [pack, setPack] = useState<PublicReview | null>(null), [index, setIndex] = useState(0);
  const [ratings, setRatings] = useState<Partial<ReviewRatings>>({}), [reason, setReason] = useState('');
  const [message, setMessage] = useState('比較セットを読み込んでいます…'), [saving, setSaving] = useState(false);
  const drafts = useRef(new Map<string, { ratings: Partial<ReviewRatings>; reason: string }>());
  const annotator = 'local-reviewer', item = pack?.items[index], complete = !!pack && pack.answers.length === pack.items.length;
  useEffect(() => {
    let disposed = false;
    api('/api/v1/review').then((data: PublicReview) => {
      if (disposed) return;
      setPack(data); const unanswered = data.items.findIndex(item => !data.answers.some(answer => answer.itemId === item.id));
      setIndex(Math.max(0, unanswered)); setMessage(data.answers.length ? '保存した回答から再開しました。' : '未回答です。判定はあなたの操作でのみ保存されます。');
    }).catch(error => { if (!disposed) setMessage(error.message.includes('REVIEW_NOT_PREPARED') ? '現在、評価をお願いする比較セットはありません。' : error.message); });
    return () => { disposed = true; };
    // The parent API uses a stable token ref; rerenders must not reset a rating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const saved = pack?.answers.find(answer => answer.itemId === item?.id);
    const draft = item ? drafts.current.get(item.id) : undefined;
    setRatings(draft?.ratings ?? saved?.ratings ?? {}); setReason(draft?.reason ?? saved?.reason ?? '');
  }, [item?.id, pack?.batchId]);
  async function save() {
    if (!pack || !item || saving || reviewDimensions.some(dimension => !ratings[dimension])) return;
    setSaving(true);
    try {
      const result = await api('/api/v1/review/ratings', { method: 'POST', body: JSON.stringify({ batchId: pack.batchId, itemId: item.id, annotatorId: annotator, ratings, reason }) });
      const answers = [...pack.answers.filter(answer => answer.itemId !== item.id), result.answer];
      drafts.current.delete(item.id);
      setPack({ ...pack, answers });
      const next = pack.items.findIndex((candidate, i) => i > index && !answers.some(answer => answer.itemId === candidate.id));
      const first = pack.items.findIndex(candidate => !answers.some(answer => answer.itemId === candidate.id));
      if (next >= 0 || first >= 0) setIndex(next >= 0 ? next : first);
      setMessage(`回答を端末に保存しました（${answers.length} / ${pack.items.length}件）。`);
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  }
  async function exportResults() {
    try {
      const data = await api('/api/v1/review/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `buront-human-review-${pack!.batchId.slice(0, 12)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('回答と、伏せていた方式・ベクトル値を出力しました。');
    } catch (error) { setMessage((error as Error).message); }
  }
  return <section className="human-review" aria-labelledby="review-title">
    <div className="section-top"><h2 id="review-title">人間チェック</h2>{pack && <span>{pack.answers.length} / {pack.items.length} 件回答済み</span>}</div>
    {pack && <><p>同じ原文の二案を、三つの観点で判定してください。生成方法・順位・自動点数は伏せています。両方だめな場合は、無理に選ぶ必要はありません。</p>
    <p className="note">「判定を保存」で、この端末に記録します。保存済みの回答は再読み込みやサーバー再起動後も再開できます。前・次へ移動しただけでは保存しません。自動で回答・学習・合格扱いにすることはありません。</p></>}
    <p role="status" aria-live="polite">{message}</p>
    {complete && <div className="notice"><strong>全件の判定を保存しました。</strong><p>必要なら各回答を見直せます。評価結果を出力すると、伏せていた方式とベクトル値も確認できます。</p><button onClick={() => void exportResults()}>評価結果を出力</button></div>}
    {pack && item && <>
      <div className="review-navigation"><button disabled={saving || index === 0} onClick={() => setIndex(index - 1)}>前の比較</button><strong>比較 {index + 1} / {pack.items.length}</strong><button disabled={saving || index + 1 === pack.items.length} onClick={() => setIndex(index + 1)}>次の比較</button></div>
      <div className="review-source"><h3>原文</h3><p>{item.source}</p></div>
      <div className="pair review-pair"><article><h3>左の案</h3><p>{item.left}</p></article><article><h3>右の案</h3><p>{item.right}</p></article></div>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        {reviewDimensions.map(dimension => <fieldset key={dimension} disabled={saving}><legend>{prompts[dimension]}</legend><p className="note">{hints[dimension]}</p><div className="review-options">{reviewChoices.map(choice => <label key={choice}><input type="radio" name={`rating-${dimension}`} value={choice} checked={ratings[dimension] === choice} onChange={() => { const next = { ...ratings, [dimension]: choice }; setRatings(next); drafts.current.set(item.id, { ratings: next, reason }); }} />{choiceLabels[choice]}</label>)}</div></fieldset>)}
        <label htmlFor="review-reason">気になった点・直してほしい点（任意）</label><textarea id="review-reason" rows={3} maxLength={2000} value={reason} disabled={saving} onChange={event => { setReason(event.target.value); drafts.current.set(item.id, { ratings, reason: event.target.value }); }} />
        <div className="actions"><button className="primary" type="submit" disabled={saving || reviewDimensions.some(dimension => !ratings[dimension])}>{saving ? '保存しています…' : 'この判定を保存して進む'}</button></div>
      </form>
    </>}
  </section>;
}
