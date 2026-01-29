// src/pages/dashboards/StudentDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../../auth";
import {
  apiAnalyzeText,
  apiGetProfile,
  apiGetRecommendationsExplain,
  apiUpsertProfile,
  apiApplyTest,
  apiGetGaps,
  // ⬇️ ДОБАВЬ в ../../api/backend эти 2 функции и типы (если ещё не добавляла)
  apiGetProfileMeta,
  apiGetProfileHistory,
  type GapSummaryItem,
  type ReaderProfile,
  type ExplainedRecommendation,
  type ProfileMeta,
  type ProfileEvent,
} from "../../api/backend";

type TabKey = "texts" | "test" | "results";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function safeEntries(obj: any): [string, number][] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj)
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .filter(([, v]) => Number.isFinite(v));
}

function topConcepts(concepts: Record<string, number> | undefined, n = 10) {
  const arr = safeEntries(concepts);
  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, n);
}

function fmt01(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function friendlySource(s: string | null | undefined) {
  if (!s) return "—";
  if (s === "test") return "Анкета";
  if (s === "text") return "Текст";
  return s;
}

export default function StudentDashboard() {
  const nav = useNavigate();
  const user = getUser();

  // guard
  useEffect(() => {
    if (!user) nav("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readerId = user?.email ?? "student@test.ru";
  const [tab, setTab] = useState<TabKey>("results");

  // data
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [gaps, setGaps] = useState<GapSummaryItem[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsErr, setGapsErr] = useState<string | null>(null);

  const [recs, setRecs] = useState<ExplainedRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  // history/meta
  const [meta, setMeta] = useState<ProfileMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ProfileEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  // texts panel
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  // test submit
  const [submitTestLoading, setSubmitTestLoading] = useState(false);
  const [submitTestMsg, setSubmitTestMsg] = useState<string | null>(null);

  const age = profile?.age ?? "16+";

  async function loadProfile() {
    setProfileErr(null);
    setProfileLoading(true);
    try {
      const p = await apiGetProfile(readerId);
      setProfile(p);
    } catch {
      // если профиля нет — создаём пустой (чтобы рекомендации/анкета работали с 1 клика)
      try {
        const created = await apiUpsertProfile({ id: readerId, age: "16+", concepts: {} });
        setProfile(created);
      } catch (e: any) {
        setProfileErr(e?.message ?? "Не удалось получить/создать профиль");
      }
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadGaps() {
    setGapsErr(null);
    setGapsLoading(true);
    try {
      const list = await apiGetGaps(readerId);
      setGaps(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setGaps([]);
      setGapsErr(e?.message ?? "Не удалось получить дефициты");
    } finally {
      setGapsLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecsErr(null);
    setRecsLoading(true);
    try {
      const list = await apiGetRecommendationsExplain(readerId, 5);
      setRecs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setRecs([]);
      setRecsErr(e?.message ?? "Не удалось получить рекомендации");
    } finally {
      setRecsLoading(false);
    }
  }

  async function loadMeta() {
    setMetaErr(null);
    setMetaLoading(true);
    try {
      const m = await apiGetProfileMeta(readerId);
      setMeta(m);
    } catch (e: any) {
      setMeta(null);
      setMetaErr(e?.message ?? "Не удалось получить метаданные");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadHistory(limit = 20) {
    setHistoryErr(null);
    setHistoryLoading(true);
    try {
      const h = await apiGetProfileHistory(readerId, limit);
      const arr = Array.isArray(h) ? h : [];
      // newest first
      arr.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
      setHistory(arr);
    } catch (e: any) {
      setHistory([]);
      setHistoryErr(e?.message ?? "Не удалось получить историю");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshAll(opts?: { withHistory?: boolean }) {
    await loadProfile();
    await loadGaps();
    await loadRecommendations();
    await loadMeta();
    if (opts?.withHistory || historyOpen) await loadHistory(20);
  }

  useEffect(() => {
    void refreshAll({ withHistory: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerId]);

  async function onLogout() {
    clearUser();
    nav("/");
  }

  async function onAnalyzeText() {
    setAnalyzeMsg(null);
    const body = textBody.trim();
    if (body.length < 30) {
      setAnalyzeMsg("Текст слишком короткий (минимум ~30 символов).");
      return;
    }

    setAnalyzeLoading(true);
    try {
      // title пока не отправляем — если на бэке появится поле title, добавим
      await apiAnalyzeText(readerId, body);
      setAnalyzeMsg("Текст проанализирован. Профиль обновлён.");
      setTextTitle("");
      setTextBody("");
      await refreshAll({ withHistory: true });
      setTab("results");
    } catch (e: any) {
      setAnalyzeMsg(e?.message ?? "Ошибка анализа текста");
    } finally {
      setAnalyzeLoading(false);
    }
  }

  async function onSubmitTestWithConcepts01(test01: Record<string, number>) {
    setSubmitTestMsg(null);
    setSubmitTestLoading(true);

    try {
      const updated = await apiApplyTest({
        reader_id: readerId,
        age: age,
        test_concepts: test01,
      });

      setProfile(updated);
      setSubmitTestMsg("Анкета сохранена. Профиль обновлён.");
      await refreshAll({ withHistory: true });
      setTab("results");
    } catch (e: any) {
      setSubmitTestMsg(e?.message ?? "Ошибка сохранения анкеты");
    } finally {
      setSubmitTestLoading(false);
    }
  }

  const top = useMemo(() => topConcepts(profile?.concepts, 10), [profile]);

  const deficitTop = useMemo(() => {
    return (gaps ?? []).filter((g) => g.direction === "below" && g.gap > 0).slice(0, 5);
  }, [gaps]);

  const strengthsTop = useMemo(() => {
    return (gaps ?? []).filter((g) => g.direction === "above" && g.gap < 0).slice(0, 3);
  }, [gaps]);

  const deficitsModeHint = useMemo(() => {
    return "Дефициты — это темы, где ваш текущий уровень ниже целевого для возраста. Рекомендации подбираются так, чтобы закрывать дефициты. Если дефицитов нет, система предлагает книги для углубления сильных тем.";
  }, []);

  const maxScore = useMemo(() => {
    const xs = (recs ?? [])
      .map((r) => Number(r?.why?.score ?? 0))
      .filter((x) => Number.isFinite(x) && x > 0);
    return xs.length ? Math.max(...xs) : 0;
  }, [recs]);

  return (
    <div className="page">
      <div className="shellWide">
        <div className="card">
          <div className="headerRow">
            <div>
              <div className="h1">Кабинет ученика</div>
              <div className="muted">
                {readerId} • возрастная группа: <b>{age}</b>
              </div>
            </div>
            <button className="btn" onClick={onLogout}>
              Выйти
            </button>
          </div>

          <div className="tabsRow">
            <button className={`tabBtn ${tab === "texts" ? "tabBtnActive" : ""}`} onClick={() => setTab("texts")}>
              Тексты пользователя
            </button>
            <button className={`tabBtn ${tab === "test" ? "tabBtnActive" : ""}`} onClick={() => setTab("test")}>
              Тестирование
            </button>
            <button className={`tabBtn ${tab === "results" ? "tabBtnActive" : ""}`} onClick={() => setTab("results")}>
              Итоги и рекомендации
            </button>
          </div>

          {tab === "texts" && (
            <div className="grid2">
              <div className="panel">
                <div className="panelTitle">Добавить текст (сочинение/эссе)</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Можно вставить фрагмент текста. Анализ обновит профиль ценностных тем.
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Название (необязательно)</label>
                  <input
                    className="input"
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="Например: «Почему важно быть честным»"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Текст</label>
                  <textarea
                    className="textarea"
                    value={textBody}
                    onChange={(e) => setTextBody(e.target.value)}
                    placeholder="Вставьте текст здесь…"
                    rows={10}
                  />
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="primaryBtn" onClick={() => void onAnalyzeText()} disabled={analyzeLoading}>
                    {analyzeLoading ? "Анализ…" : "Проанализировать"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setTextTitle("");
                      setTextBody("");
                      setAnalyzeMsg(null);
                    }}
                    disabled={analyzeLoading}
                  >
                    Очистить
                  </button>
                </div>

                {analyzeMsg && <div className="note">{analyzeMsg}</div>}
              </div>

              <div className="panel">
                <div className="panelTitle">Как это влияет на рекомендации</div>
                <ul className="ul">
                  <li>Текст преобразуется в набор концептов (тем) и их выраженность.</li>
                  <li>Профиль обновляется (агрегация по историям взаимодействий).</li>
                  <li>Рекомендации подбираются под дефициты или углубление сильных тем.</li>
                </ul>
                <div className="note">
                  Если после анализа рекомендаций нет — проверь, что в Neo4j есть произведения (Work) с концептами
                  (HAS_CONCEPT).
                </div>
              </div>
            </div>
          )}

          {tab === "test" && (
            <TestPanel
              profileAge={age}
              submitLoading={submitTestLoading}
              submitMsg={submitTestMsg}
              onSubmitConcepts01={onSubmitTestWithConcepts01}
            />
          )}

          {tab === "results" && (
            <div className="gridResults">
              <div className="panel">
                <div className="panelTitle">Профиль, дефициты и история</div>

                {profileLoading && <div className="muted">Загрузка профиля…</div>}
                {profileErr && <div className="error">{profileErr}</div>}

                <div className="subTitle">Текущие концепты (топ)</div>
                <div className="chips">
                  {top.length === 0 ? (
                    <span className="muted">Нет данных</span>
                  ) : (
                    top.map(([k]) => (
                      <span key={k} className="chip">
                        {k}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Дефициты (топ)
                </div>

                {gapsLoading && <div className="muted">Считаю дефициты…</div>}
                {gapsErr && <div className="error">{gapsErr}</div>}

                <div className="chips">
                  {deficitTop.length === 0 && !gapsLoading ? (
                    <span className="muted">Дефицитов не найдено (включается режим углубления)</span>
                  ) : (
                    deficitTop.map((g) => (
                      <span key={g.concept} className="chip">
                        {g.concept} • дефицит {fmt01(g.gap)}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Сильные стороны
                </div>
                <div className="chips">
                  {strengthsTop.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    strengthsTop.map((g) => (
                      <span key={g.concept} className="chip">
                        {g.concept} • +{fmt01(Math.abs(g.gap))}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  История профиля
                </div>

                {(metaLoading || historyLoading) && <div className="muted">Загрузка истории…</div>}
                {metaErr && <div className="error">{metaErr}</div>}

                {meta && (
                  <div className="note" style={{ marginTop: 10 }}>
                    <div className="muted">
                      Тестов: <b>{meta.test_count}</b> • Текстов: <b>{meta.text_count}</b>
                    </div>
                    <div className="muted">
                      Последнее обновление: <b>{fmtDT(meta.last_update_at)}</b>
                    </div>
                    <div className="muted">
                      Источник: <b>{friendlySource(meta.last_source)}</b>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Последняя анкета: <b>{fmtDT(meta.last_test_at)}</b> • Последний текст: <b>{fmtDT(meta.last_text_at)}</b>
                    </div>
                  </div>
                )}

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn"
                    onClick={() => {
                      const next = !historyOpen;
                      setHistoryOpen(next);
                      if (next) void loadHistory(20);
                    }}
                    disabled={historyLoading}
                  >
                    {historyOpen ? "Скрыть события" : "Показать события"}
                  </button>

                  <button
                    className="btn"
                    onClick={() => void refreshAll({ withHistory: historyOpen })}
                    disabled={recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading}
                  >
                    Обновить данные
                  </button>
                </div>

                {historyOpen && (
                  <div style={{ marginTop: 10 }}>
                    {historyErr && <div className="error">{historyErr}</div>}
                    {history.length === 0 && !historyLoading ? (
                      <div className="muted">Пока нет событий. Пройди анкету или добавь текст.</div>
                    ) : (
                      <div className="historyList">
                        {history.map((ev) => (
                          <HistoryItem key={ev.id} ev={ev} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Пояснение
                </div>
                <div className="muted">{deficitsModeHint}</div>

                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={() => setTab("texts")}>
                    Добавить текст →
                  </button>
                  <button className="btn" onClick={() => setTab("test")}>
                    Пройти анкету →
                  </button>
                </div>
              </div>

              <div className="panel grow">
                <div className="panelTitle">Рекомендации (объяснимые)</div>

                <div className="row" style={{ marginBottom: 10 }}>
                  <button
                    className="btn"
                    onClick={() => void refreshAll({ withHistory: historyOpen })}
                    disabled={recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading}
                  >
                    Обновить данные
                  </button>
                  {(recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading) && (
                    <span className="muted">Загрузка…</span>
                  )}
                </div>

                {recsErr && <div className="error">{recsErr}</div>}

                {(!recs || recs.length === 0) && !recsLoading && !recsErr && (
                  <div className="muted">Пока нет рекомендаций. Добавь текст или пройди анкету.</div>
                )}

                <div className="recsList">
                  {(recs ?? []).map((item) => (
                    <RecommendationCard key={item.work.id} item={item} maxScore={maxScore} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <StyleBlock />
    </div>
  );
}

/* -------------------------- History UI -------------------------- */

function HistoryItem({ ev }: { ev: ProfileEvent }) {
  const kind = ev.type === "test" ? "Анкета" : "Текст";
  const when = fmtDT(ev.created_at);

  // Пытаемся красиво подсветить “что изменилось” (если payload/profile_after похожи на ожидаемые)
  const payloadConcepts: Record<string, number> | undefined =
    ev?.payload?.test_concepts ?? ev?.payload?.concepts ?? ev?.payload?.concepts01;
  const afterConcepts: Record<string, number> | undefined = ev?.profile_after?.concepts ?? ev?.profile_after?.concepts01;

  const topPayload = useMemo(() => topConcepts(payloadConcepts, 4), [payloadConcepts]);
  const topAfter = useMemo(() => topConcepts(afterConcepts, 4), [afterConcepts]);

  return (
    <div className="historyItem">
      <div className="historyTop">
        <div className="historyTitle">
          <b>{kind}</b> • {when}
        </div>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        {topPayload.length > 0 && (
          <>
            Входные данные (топ):{" "}
            <b>
              {topPayload.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}
            </b>
            <br />
          </>
        )}
        {topAfter.length > 0 && (
          <>
            Профиль после (топ):{" "}
            <b>
              {topAfter.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}
            </b>
          </>
        )}
        {topPayload.length === 0 && topAfter.length === 0 && <>Событие сохранено.</>}
      </div>
    </div>
  );
}

/* -------------------------- Recommendation UI -------------------------- */

function RecommendationCard({ item, maxScore }: { item: ExplainedRecommendation; maxScore: number }) {
  const gaps = Array.isArray(item?.why?.gaps) ? item.why.gaps : [];

  const percent = useMemo(() => {
    const s = Number(item?.why?.score ?? 0);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
    return Math.round((s / maxScore) * 100);
  }, [item, maxScore]);

  const tags = useMemo(() => {
    const c = item?.work?.concepts ?? {};
    const arr = safeEntries(c);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, 3).map(([k]) => k);
  }, [item]);

  const deficitHits = useMemo(() => {
    const hits = gaps
      .filter((g: any) => Number(g.gap) > 0)
      .slice(0, 3)
      .map((g: any) => (g.via ? `${g.concept} (через ${g.via})` : g.concept));
    return hits;
  }, [gaps]);

  const modeLabel = item?.why?.mode === "correction" ? "коррекция дефицитов" : "углубление сильных тем";

  return (
    <div className="recCard">
      <div className="recTop">
        <div className="recTitle">{item.work.title}</div>
        <div className="muted">
          {item.work.author} • {item.work.age} • <b>соответствие: {percent}%</b> • режим: {modeLabel}
        </div>
      </div>

      <div className="chips" style={{ marginTop: 10 }}>
        {tags.map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        {deficitHits.length > 0 ? (
          <>
            Закрывает дефициты: <b>{deficitHits.join(", ")}</b>
          </>
        ) : (
          <>Подходит для углубления текущих сильных тем.</>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Test Panel (expanded) -------------------------- */

type QuestionItem = {
  id: string;
  scale: string; // 9 шкал или "__sd__" / "__attention__"
  title: string;
  text: string;
  reversed?: boolean;
  attention?: boolean;
};

type Likert = 1 | 2 | 3 | 4 | 5;

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Строгая калибровка: mean(1..5) -> 0..1 ~ 0.2..0.8
 */
function mean1to5_to_01_strict(mean: number) {
  const centered = (mean - 3) / 2; // [-1..1]
  const v = 0.5 + centered * 0.3; // [0.2..0.8]
  return clamp01(v);
}

/**
 * Если шкала социальной желательности высокая — уменьшаем значения остальных шкал
 */
function applySocialDesirabilityPenalty(test01: Record<string, number>, sdMean1to5: number) {
  const t = clamp01((sdMean1to5 - 3) / 2);
  const penalty = t * 0.18;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(test01)) out[k] = clamp01(v - penalty);
  return out;
}

function TestPanel(props: {
  profileAge: string;
  submitLoading: boolean;
  submitMsg: string | null;
  onSubmitConcepts01: (concepts01: Record<string, number>) => Promise<void>;
}) {
  const CORE_SCALES = new Set([
    "нравственный_выбор",
    "ответственность",
    "честь_и_достоинство",
    "смысл_жизни",
    "любовь",
    "коллективизм",
    "патриотизм",
    "свобода",
    "саморазвитие",
  ]);

  const base: QuestionItem[] = [
    // --- Нравственный выбор (7) ---
    { id: "nv1", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я стараюсь отличать “можно” от “правильно”, даже если так сложнее." },
    { id: "nv2", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Перед сложным решением я думаю о последствиях для других людей." },
    { id: "nv3", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Мне важно, чтобы мои поступки соответствовали моим принципам." },
    { id: "nv4", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я могу изменить своё решение, если понимаю, что оно несправедливо." },
    { id: "nv5", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я стараюсь быть честным(ой), даже когда это невыгодно." },
    { id: "nv6", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я думаю о том, как бы я хотел(а), чтобы поступили со мной." },
    { id: "nv7", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Иногда я считаю, что можно нарушить правила, если никто не узнает.", reversed: true },

    // --- Ответственность (7) ---
    { id: "ot1", scale: "ответственность", title: "Ответственность", text: "Если я дал(а) обещание, я стараюсь выполнить его." },
    { id: "ot2", scale: "ответственность", title: "Ответственность", text: "Я беру на себя задачи и довожу их до конца." },
    { id: "ot3", scale: "ответственность", title: "Ответственность", text: "Если я ошибся(лась), я готов(а) признать это." },
    { id: "ot4", scale: "ответственность", title: "Ответственность", text: "Мне важно выполнять обязательства перед людьми." },
    { id: "ot5", scale: "ответственность", title: "Ответственность", text: "Я стараюсь планировать дела, чтобы успевать вовремя." },
    { id: "ot6", scale: "ответственность", title: "Ответственность", text: "Я понимаю, что мои решения влияют на будущее." },
    { id: "ot7", scale: "ответственность", title: "Ответственность", text: "Если что-то не получилось, обычно виноваты обстоятельства, а не я.", reversed: true },

    // --- Честь и достоинство (7) ---
    { id: "cd1", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Мне важно уважать себя и не поступать унизительно." },
    { id: "cd2", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я стараюсь защищать достоинство другого человека, если вижу несправедливость." },
    { id: "cd3", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я стараюсь держать слово." },
    { id: "cd4", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я не одобряю действия, которые унижают людей." },
    { id: "cd5", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Для меня важна репутация, но не ценой лжи." },
    { id: "cd6", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я стараюсь не пользоваться слабостью другого человека." },
    { id: "cd7", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Иногда допустимо унизить другого, если он этого “заслужил”.", reversed: true },

    // --- Смысл жизни (7) ---
    { id: "sl1", scale: "смысл_жизни", title: "Смысл жизни", text: "Мне важно понимать, зачем я учусь/работаю и к чему иду." },
    { id: "sl2", scale: "смысл_жизни", title: "Смысл жизни", text: "Я думаю о своих целях на будущее." },
    { id: "sl3", scale: "смысл_жизни", title: "Смысл жизни", text: "Я задаю себе вопросы о том, что важно в жизни." },
    { id: "sl4", scale: "смысл_жизни", title: "Смысл жизни", text: "Иногда книги помогают мне увидеть новые смыслы." },
    { id: "sl5", scale: "смысл_жизни", title: "Смысл жизни", text: "Я чувствую, что мои действия имеют значение." },
    { id: "sl6", scale: "смысл_жизни", title: "Смысл жизни", text: "Я стараюсь делать выбор осознанно, а не “как получится”." },
    { id: "sl7", scale: "смысл_жизни", title: "Смысл жизни", text: "Я почти никогда не думаю о смысле жизни — это пустая тема.", reversed: true },

    // --- Любовь/эмпатия (7) ---
    { id: "lv1", scale: "любовь", title: "Любовь и эмпатия", text: "Я умею сопереживать другим людям." },
    { id: "lv2", scale: "любовь", title: "Любовь и эмпатия", text: "Я стараюсь поддерживать близких в трудные моменты." },
    { id: "lv3", scale: "любовь", title: "Любовь и эмпатия", text: "Я могу поставить себя на место другого человека." },
    { id: "lv4", scale: "любовь", title: "Любовь и эмпатия", text: "Я замечаю, когда кому-то плохо, даже если он не говорит." },
    { id: "lv5", scale: "любовь", title: "Любовь и эмпатия", text: "Я стараюсь проявлять заботу в действиях, а не только словами." },
    { id: "lv6", scale: "любовь", title: "Любовь и эмпатия", text: "Мне интересны чувства и мотивы людей (в жизни или в книгах)." },
    { id: "lv7", scale: "любовь", title: "Любовь и эмпатия", text: "Если человеку плохо, это обычно его проблемы, меня не касается.", reversed: true },

    // --- Коллективизм (7) ---
    { id: "cl1", scale: "коллективизм", title: "Коллективизм", text: "Мне важно быть частью команды/класса/группы." },
    { id: "cl2", scale: "коллективизм", title: "Коллективизм", text: "Совместная работа часто даёт лучший результат, чем работа в одиночку." },
    { id: "cl3", scale: "коллективизм", title: "Коллективизм", text: "Я готов(а) помогать другим, даже если это не приносит выгоды." },
    { id: "cl4", scale: "коллективизм", title: "Коллективизм", text: "Я считаю важным учитывать интересы группы." },
    { id: "cl5", scale: "коллективизм", title: "Коллективизм", text: "Мне легче учиться/работать, когда рядом есть поддержка." },
    { id: "cl6", scale: "коллективизм", title: "Коллективизм", text: "Я могу уступить, если это помогает общему делу." },
    { id: "cl7", scale: "коллективизм", title: "Коллективизм", text: "Каждый должен думать только о себе — это нормально.", reversed: true },

    // --- Патриотизм (7) ---
    { id: "pt1", scale: "патриотизм", title: "Патриотизм", text: "Мне важно знать культуру и историю своей страны." },
    { id: "pt2", scale: "патриотизм", title: "Патриотизм", text: "Я уважаю традиции и язык своего народа." },
    { id: "pt3", scale: "патриотизм", title: "Патриотизм", text: "Я считаю важным приносить пользу обществу." },
    { id: "pt4", scale: "патриотизм", title: "Патриотизм", text: "Меня волнует, что происходит в моей стране." },
    { id: "pt5", scale: "патриотизм", title: "Патриотизм", text: "Я ценю культурное наследие и считаю важным его сохранять." },
    { id: "pt6", scale: "патриотизм", title: "Патриотизм", text: "Я ощущаю связь с местом, где живу, и людьми вокруг." },
    { id: "pt7", scale: "патриотизм", title: "Патриотизм", text: "Мне всё равно, что будет со страной — это не моё дело.", reversed: true },

    // --- Свобода (7) ---
    { id: "fr1", scale: "свобода", title: "Свобода выбора", text: "Мне важно самостоятельно принимать решения." },
    { id: "fr2", scale: "свобода", title: "Свобода выбора", text: "Я ценю право выбирать свой путь." },
    { id: "fr3", scale: "свобода", title: "Свобода выбора", text: "Я могу отстаивать своё мнение спокойно и аргументированно." },
    { id: "fr4", scale: "свобода", title: "Свобода выбора", text: "Я стараюсь не поддаваться давлению, когда делаю выбор." },
    { id: "fr5", scale: "свобода", title: "Свобода выбора", text: "Я уважаю свободу другого человека." },
    { id: "fr6", scale: "свобода", title: "Свобода выбора", text: "Мне важно иметь возможность говорить “нет”." },
    { id: "fr7", scale: "свобода", title: "Свобода выбора", text: "Лучше, когда за меня решают другие — так спокойнее.", reversed: true },

    // --- Саморазвитие (7) ---
    { id: "sdv1", scale: "саморазвитие", title: "Саморазвитие", text: "Я стараюсь узнавать новое." },
    { id: "sdv2", scale: "саморазвитие", title: "Саморазвитие", text: "Я могу анализировать свои ошибки и учиться на них." },
    { id: "sdv3", scale: "саморазвитие", title: "Саморазвитие", text: "Книги помогают мне понять себя и мир." },
    { id: "sdv4", scale: "саморазвитие", title: "Саморазвитие", text: "Я ставлю цели и двигаюсь к ним." },
    { id: "sdv5", scale: "саморазвитие", title: "Саморазвитие", text: "Мне интересно развивать навыки (учёба/творчество/спорт и т.п.)." },
    { id: "sdv6", scale: "саморазвитие", title: "Саморазвитие", text: "Я стараюсь расширять кругозор." },
    { id: "sdv7", scale: "саморазвитие", title: "Саморазвитие", text: "Развиваться не обязательно — человек не меняется.", reversed: true },

    // --- Социальная желательность (6) ---
    { id: "sdl1", scale: "__sd__", title: "Шкала искренности", text: "Я никогда в жизни не говорил(а) неправду." },
    { id: "sdl2", scale: "__sd__", title: "Шкала искренности", text: "Я всегда и во всём поступаю идеально." },
    { id: "sdl3", scale: "__sd__", title: "Шкала искренности", text: "Мне никогда не бывает обидно или неприятно." },
    { id: "sdl4", scale: "__sd__", title: "Шкала искренности", text: "Я всегда одинаково доброжелателен(ьна) со всеми." },
    { id: "sdl5", scale: "__sd__", title: "Шкала искренности", text: "Я никогда не раздражаюсь." },
    { id: "sdl6", scale: "__sd__", title: "Шкала искренности", text: "Я никогда не сомневаюсь в своих решениях." },

    // --- attention check (1) ---
    { id: "att1", scale: "__attention__", title: "Проверка внимательности", text: "Пожалуйста, выберите вариант «Скорее согласен(а)» (4).", attention: true },
  ];

  const [ordered] = useState<QuestionItem[]>(() => {
    const shuffled = shuffle(base.filter((q) => !q.attention));
    const att = base.find((q) => q.attention)!;
    const insertAt = Math.min(Math.max(10, Math.floor(shuffled.length * 0.55)), shuffled.length);
    shuffled.splice(insertAt, 0, att);
    return shuffled;
  });

  const total = ordered.length;
  const [answersById, setAnswersById] = useState<Record<string, Likert | undefined>>({});
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = ordered[step];
  const progress = Math.round((step / (total - 1)) * 100);

  const leftLabel = "Совсем не про меня";
  const rightLabel = "Полностью согласен(а)";

  function setLikert(v: Likert) {
    setAnswersById((prev) => ({ ...prev, [current.id]: v }));
    setError(null);
  }

  function next() {
    if (!answersById[current.id]) {
      setError("Выберите вариант ответа, чтобы продолжить.");
      return;
    }
    setStep((s) => Math.min(total - 1, s + 1));
  }

  function prev() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function validateAllAnswered() {
    for (const q of ordered) if (!answersById[q.id]) return false;
    return true;
  }

  function validateAttention() {
    return answersById["att1"] === 4;
  }

  function computeMeansByScale() {
    const byScale: Record<string, number[]> = {};

    for (const q of ordered) {
      if (q.attention) continue;
      const a = answersById[q.id];
      if (!a) continue;

      const scored = q.reversed ? (6 - a) : a; // 1..5
      (byScale[q.scale] ??= []).push(scored);
    }

    const means: Record<string, number> = {};
    for (const [scale, arr] of Object.entries(byScale)) {
      means[scale] = arr.reduce((s, x) => s + x, 0) / arr.length;
    }
    return means; // mean 1..5
  }

  async function finish() {
    setError(null);

    if (!consent) {
      setError("Подтвердите согласие: анкета носит образовательный характер и не является диагнозом.");
      return;
    }
    if (!validateAllAnswered()) {
      setError("Ответьте на все вопросы, чтобы завершить.");
      return;
    }
    if (!validateAttention()) {
      setError("Контрольный вопрос выбран неверно. Пройдите внимательнее.");
      return;
    }

    const means = computeMeansByScale();
    const sdMean = means["__sd__"] ?? 3;

    const core01: Record<string, number> = {};
    for (const [scale, mean] of Object.entries(means)) {
      if (!CORE_SCALES.has(scale)) continue;
      core01[scale] = mean1to5_to_01_strict(mean);
    }

    const adjusted = applySocialDesirabilityPenalty(core01, sdMean);
    await props.onSubmitConcepts01(adjusted);
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Анкета ценностных ориентаций</div>

      <div className="testIntro">
        <div className="testNote">
          Анкета помогает уточнить профиль чтения и сделать рекомендации объяснимыми. <b>Это не медицинская диагностика</b>.
        </div>
        <div className="testMeta">
          Возрастная группа: <b>{props.profileAge}</b> • Вопрос: <b>{step + 1}</b> / <b>{total}</b>
        </div>

        <div className="progressWrap" aria-label="progress">
          <div className="progressBar" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="questionCard">
        <div className="qTop">
          <div className="qScale">{current.title}</div>
          <div className="qStep">
            {step + 1}/{total}
          </div>
        </div>

        <div className="qText">{current.text}</div>

        <div className="likertRow" role="group" aria-label="likert">
          {([1, 2, 3, 4, 5] as Likert[]).map((v) => {
            const active = answersById[current.id] === v;
            return (
              <button
                key={v}
                type="button"
                className={`likertBtn ${active ? "likertBtnActive" : ""}`}
                onClick={() => setLikert(v)}
                aria-pressed={active}
                title={`${v}/5`}
              >
                {v}
              </button>
            );
          })}
        </div>

        <div className="likertLabels">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>

        {error && <div className="testError">{error}</div>}

        <div className="navRow">
          <button className="btn" type="button" onClick={prev} disabled={step === 0}>
            Назад
          </button>

          {step < total - 1 ? (
            <button className="primaryBtn nextBtn" type="button" onClick={next}>
              Далее
            </button>
          ) : (
            <button className="primaryBtn" type="button" onClick={() => void finish()} disabled={props.submitLoading}>
              {props.submitLoading ? "Сохранение…" : "Завершить и сохранить"}
            </button>
          )}
        </div>

        <label className="consentRow">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Я понимаю, что анкета носит образовательный характер и используется для рекомендаций по чтению.</span>
        </label>

        {props.submitMsg && (
          <div className="footerNote" style={{ marginTop: 10 }}>
            {props.submitMsg}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Styles (local) -------------------------- */

function StyleBlock() {
  return (
    <style>{`
      .page {
        min-height: 100vh;
        background: radial-gradient(1200px 500px at 20% 0%, rgba(100,140,255,.14), transparent),
                    radial-gradient(900px 400px at 80% 10%, rgba(80,200,170,.12), transparent),
                    #f6f7fb;
        padding: 28px 18px;
      }
      .shellWide { max-width: 1220px; margin: 0 auto; }
      .card {
        background: white;
        border-radius: 18px;
        box-shadow: 0 10px 28px rgba(0,0,0,.07);
        padding: 22px 22px 20px;
      }
      .headerRow { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
      .h1 { font-size: 28px; font-weight: 800; letter-spacing: .2px; }
      .muted { color: rgba(20,25,35,.65); }
      .tabsRow { display:flex; gap:10px; margin-top: 14px; padding: 10px 0 4px; border-bottom: 1px solid rgba(0,0,0,.06); }
      .tabBtn {
        border: 1px solid rgba(0,0,0,.10);
        background: #fff;
        border-radius: 999px;
        padding: 9px 14px;
        font-weight: 650;
        cursor:pointer;
      }
      .tabBtnActive {
        border-color: rgba(60,110,255,.65);
        box-shadow: 0 0 0 3px rgba(60,110,255,.12);
      }

      .grid2 {
        display:grid;
        grid-template-columns: 1.2fr .8fr;
        gap:14px;
        margin-top: 14px;
      }
      .gridResults {
        display:grid;
        grid-template-columns: 360px 1fr;
        gap:14px;
        margin-top: 14px;
        align-items: start;
      }
      .panel {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px 14px 12px;
        background: rgba(255,255,255,.95);
      }
      .panel.grow { min-height: 360px; }
      .panelTitle { font-weight: 800; letter-spacing: .2px; }
      .subTitle { margin-top: 10px; font-weight: 700; font-size: 13px; letter-spacing: .2px; color: rgba(20,25,35,.7); }
      .row { display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
      .btn, .primaryBtn {
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.12);
        padding: 9px 12px;
        cursor: pointer;
        background: #fff;
        font-weight: 650;
      }
      .primaryBtn {
        border-color: rgba(60,110,255,.55);
        background: rgba(60,110,255,.10);
      }
      .btn:disabled, .primaryBtn:disabled { opacity: .6; cursor: default; }

      .label { display:block; font-size: 13px; font-weight: 650; margin-bottom: 6px; color: rgba(20,25,35,.8); }
      .input, .textarea {
        width: 100%;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
      }
      .textarea { resize: vertical; }

      .chips { display:flex; flex-wrap: wrap; gap:8px; margin-top: 8px; }
      .chip {
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(60,110,255,.22);
        background: rgba(60,110,255,.07);
        font-size: 13px;
      }
      .note {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px dashed rgba(60,110,255,.35);
        border-radius: 12px;
        background: rgba(60,110,255,.06);
      }
      .error {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(220,50,70,.25);
        background: rgba(220,50,70,.07);
        color: rgba(120,10,20,.9);
        font-weight: 650;
      }

      .ul { margin: 10px 0 0 18px; color: rgba(20,25,35,.78); }

      .recsList { display:flex; flex-direction: column; gap:12px; margin-top: 10px; }
      .recCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: #fff;
      }
      .recTop { display:flex; flex-direction: column; gap:4px; }
      .recTitle { font-weight: 850; font-size: 18px; }

      /* History */
      .historyList { display:flex; flex-direction: column; gap:10px; margin-top: 10px; }
      .historyItem {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(255,255,255,.85);
      }
      .historyTop { display:flex; justify-content: space-between; align-items: center; gap: 10px; }
      .historyTitle { font-weight: 750; }

      /* Test UI */
      .testIntro { margin-top: 10px; }
      .testNote { color: rgba(20,25,35,.75); }
      .testMeta { margin-top: 6px; color: rgba(20,25,35,.70); }
      .progressWrap {
        margin-top: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.06);
        overflow: hidden;
      }
      .progressBar { height: 100%; background: rgba(60,110,255,.55); border-radius: 999px; }
      .questionCard {
        margin-top: 12px;
        border-radius: 16px;
        border: 1px solid rgba(0,0,0,.08);
        padding: 14px;
        background: #fff;
      }
      .qTop { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
      .qScale { font-weight: 850; }
      .qStep { color: rgba(20,25,35,.65); font-weight: 650; }
      .qText { margin-top: 10px; font-size: 15px; color: rgba(20,25,35,.85); }
      .likertRow { display:flex; gap: 10px; margin-top: 12px; }
      .likertBtn {
        width: 44px; height: 40px;
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.12);
        background: #fff;
        cursor: pointer;
        font-weight: 800;
      }
      .likertBtnActive {
        border-color: rgba(60,110,255,.65);
        box-shadow: 0 0 0 3px rgba(60,110,255,.12);
        background: rgba(60,110,255,.08);
      }
      .likertLabels { display:flex; justify-content: space-between; margin-top: 6px; color: rgba(20,25,35,.65); font-size: 12px; }
      .likertLabels span:last-child{
        margin-right: 778px;
        text-align: right;
      }
      .testError {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(220,50,70,.25);
        background: rgba(220,50,70,.07);
        color: rgba(120,10,20,.9);
        font-weight: 650;
      }
      .navRow{
        display:flex;
        justify-content: flex-start;
        gap: 10px;
        margin-top: 12px;
      }
      .nextBtn { margin-left: 15px; }
      .consentRow { display:flex; gap: 10px; align-items:flex-start; margin-top: 12px; color: rgba(20,25,35,.75); }
      .footerNote { padding: 10px 12px; border-radius: 12px; border: 1px dashed rgba(60,110,255,.35); background: rgba(60,110,255,.06); }

      @media (max-width: 980px) {
        .gridResults { grid-template-columns: 1fr; }
        .grid2 { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
