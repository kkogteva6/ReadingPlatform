// src/pages/dashboards/ParentDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../../auth";
import {
  apiGetProfile,
  apiGetGaps,
  apiGetRecommendationsExplain,
  // ⚠️ если у тебя другая функция/путь — переименуй здесь
  apiGetProfileHistory,
  type ReaderProfile,
  type GapSummaryItem,
  type ExplainedRecommendation,
} from "../../api/backend";

type TabKey = "child" | "support";

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

function fmtDt(ts: any) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts ?? "");
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}`;
}

/** ------------------ types for history (подстрой под свой бэкенд) ------------------ */
type ProfileHistoryEvent = {
  id?: string;
  at?: string; // ISO
  type?: "test" | "text" | string;
  title?: string; // например "Текст" или "Анкета"
  // что показываем:
  input_top?: Array<{ concept: string; value: number }>; // для анкеты
  profile_top?: Array<{ concept: string; value: number }>; // профиль после события
};

const LS_RECENT_CHILDREN = "rp_parent_recent_children_v1";

function loadRecentChildren(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_CHILDREN);
    const arr = JSON.parse(raw ?? "[]");
    if (!Array.isArray(arr)) return [];
    return arr.map(String).filter(Boolean).slice(0, 10);
  } catch {
    return [];
  }
}

function saveRecentChild(email: string) {
  const e = email.trim().toLowerCase();
  if (!e) return;
  const cur = loadRecentChildren();
  const next = [e, ...cur.filter((x) => x !== e)].slice(0, 10);
  localStorage.setItem(LS_RECENT_CHILDREN, JSON.stringify(next));
}

export default function ParentDashboard() {
  const nav = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!user) nav("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parentEmail = user?.email ?? "parent@test.ru";

  const [tab, setTab] = useState<TabKey>("child");

  // child selector
  const [childEmail, setChildEmail] = useState<string>(() => loadRecentChildren()[0] ?? "student@test.ru");
  const [recentChildren, setRecentChildren] = useState<string[]>(() => loadRecentChildren());

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

  const [history, setHistory] = useState<ProfileHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  const age = profile?.age ?? "16+";

  async function loadProfile() {
    setProfileErr(null);
    setProfileLoading(true);
    try {
      const p = await apiGetProfile(childEmail.trim());
      setProfile(p);
    } catch (e: any) {
      setProfile(null);
      setProfileErr(e?.message ?? "Не удалось получить профиль ребёнка");
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadGaps() {
    setGapsErr(null);
    setGapsLoading(true);
    try {
      const list = await apiGetGaps(childEmail.trim());
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
      const list = await apiGetRecommendationsExplain(childEmail.trim(), 7);
      setRecs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setRecs([]);
      setRecsErr(e?.message ?? "Не удалось получить рекомендации");
    } finally {
      setRecsLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryErr(null);
    setHistoryLoading(true);
    try {
      const list = await apiGetProfileHistory(childEmail.trim());
      setHistory(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setHistory([]);
      // если эндпоинта пока нет — просто покажем аккуратный текст
      setHistoryErr(e?.message ?? "История пока недоступна (нет эндпоинта/данных)");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshAll() {
    const email = childEmail.trim().toLowerCase();
    setChildEmail(email);
    saveRecentChild(email);
    setRecentChildren(loadRecentChildren());
    await loadProfile();
    await loadGaps();
    await loadRecommendations();
    await loadHistory();
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogout() {
    clearUser();
    nav("/");
  }

  const top = useMemo(() => topConcepts(profile?.concepts, 10), [profile]);

  const deficitTop = useMemo(() => (gaps ?? []).filter((g) => g.direction === "below" && g.gap > 0).slice(0, 8), [gaps]);
  const strengthsTop = useMemo(
    () => (gaps ?? []).filter((g) => g.direction === "above" && g.gap < 0).slice(0, 6),
    [gaps]
  );

  const maxScore = useMemo(() => {
    const xs = (recs ?? [])
      .map((r) => Number(r?.why?.score ?? 0))
      .filter((x) => Number.isFinite(x) && x > 0);
    return xs.length ? Math.max(...xs) : 0;
  }, [recs]);

  const supportTips = useMemo(() => buildSupportTips(deficitTop.map((d) => d.concept)), [deficitTop]);

  return (
    <div className="page">
      <div className="shellWide">
        <div className="card">
          <div className="headerRow">
            <div>
              <div className="h1">Кабинет родителя</div>
              <div className="muted">Родитель • {parentEmail}</div>
            </div>
            <button className="btn" onClick={onLogout}>
              Выйти
            </button>
          </div>

          {/* child selector */}
          <div className="childBar">
            <div className="childLeft">
              <div className="labelSmall">Ребёнок (email)</div>
              <div className="row">
                <input
                  className="input"
                  value={childEmail}
                  onChange={(e) => setChildEmail(e.target.value)}
                  placeholder="student@test.ru"
                />
                <button className="primaryBtn" onClick={() => void refreshAll()} disabled={profileLoading || gapsLoading || recsLoading}>
                  Показать
                </button>
              </div>

              {recentChildren.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {recentChildren.map((e) => (
                    <button
                      key={e}
                      className={`chipBtn ${e === childEmail.trim().toLowerCase() ? "chipBtnActive" : ""}`}
                      onClick={() => {
                        setChildEmail(e);
                        void refreshAll();
                      }}
                      type="button"
                      title="Выбрать ребёнка"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="childRight">
              <div className="miniCard">
                <div className="miniTitle">Возрастная группа</div>
                <div className="miniValue">{age}</div>
              </div>
              <div className="miniCard">
                <div className="miniTitle">Событий истории</div>
                <div className="miniValue">{history?.length ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="tabsRow">
            <button className={`tabBtn ${tab === "child" ? "tabBtnActive" : ""}`} onClick={() => setTab("child")}>
              Отчёты и динамика
            </button>
            <button className={`tabBtn ${tab === "support" ? "tabBtnActive" : ""}`} onClick={() => setTab("support")}>
              Рекомендации поддержки чтения
            </button>
          </div>

          {tab === "child" && (
            <div className="gridParent">
              <div className="panel">
                <div className="panelTitle">Профиль ребёнка</div>

                {(profileLoading || gapsLoading) && <div className="muted">Загрузка…</div>}
                {profileErr && <div className="error">{profileErr}</div>}
                {gapsErr && <div className="error">{gapsErr}</div>}

                <div className="subTitle">Текущие темы (топ)</div>
                <div className="chips">
                  {top.length === 0 ? (
                    <span className="muted">Нет данных</span>
                  ) : (
                    top.map(([k, v]) => (
                      <span key={k} className="chip">
                        {k} • {fmt01(v)}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Дефициты (важно подтянуть)
                </div>
                <div className="chips">
                  {deficitTop.length === 0 ? (
                    <span className="muted">Дефицитов не найдено (работает режим углубления)</span>
                  ) : (
                    deficitTop.map((g) => (
                      <span key={g.concept} className="chip chipWarn">
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
                      <span key={g.concept} className="chip chipOk">
                        {g.concept} • +{fmt01(Math.abs(g.gap))}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Пояснение
                </div>
                <div className="muted">
                  Дефициты = (цель для возраста) − (текущий профиль). Рекомендации справа подбираются так, чтобы закрывать дефициты.
                </div>
              </div>

              <div className="panel grow">
                <div className="panelTitle">Рекомендации книг (объяснимые)</div>

                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => void refreshAll()} disabled={profileLoading || gapsLoading || recsLoading || historyLoading}>
                    Обновить
                  </button>
                  {(recsLoading || historyLoading) && <span className="muted">Загрузка…</span>}
                </div>

                {recsErr && <div className="error">{recsErr}</div>}

                {(!recs || recs.length === 0) && !recsLoading && !recsErr && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Пока нет рекомендаций. Пусть ребёнок пройдёт анкету или добавит текст.
                  </div>
                )}

                <div className="recsList">
                  {(recs ?? []).map((item) => (
                    <RecommendationCard key={item.work.id} item={item} maxScore={maxScore} />
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panelTitle">История профиля</div>

                {historyLoading && <div className="muted">Загрузка истории…</div>}
                {historyErr && <div className="note">{historyErr}</div>}

                {!historyLoading && (!history || history.length === 0) && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    История пока пустая. Она появится, если бэкенд сохраняет события (анкету/текст) в SQLite.
                  </div>
                )}

                <div className="histList">
                  {(history ?? []).slice(0, 12).map((ev, idx) => (
                    <div key={ev.id ?? `${ev.at}-${idx}`} className="histCard">
                      <div className="histTop">
                        <div className="histTitle">{ev.title ?? (ev.type === "text" ? "Текст" : ev.type === "test" ? "Анкета" : "Событие")}</div>
                        <div className="muted">{fmtDt(ev.at)}</div>
                      </div>

                      {Array.isArray(ev.input_top) && ev.input_top.length > 0 && (
                        <div className="histBlock">
                          <div className="histLabel">Входные данные (топ)</div>
                          <div className="muted">
                            {ev.input_top
                              .slice(0, 6)
                              .map((x) => `${x.concept} ${fmt01(Number(x.value))}`)
                              .join(", ")}
                          </div>
                        </div>
                      )}

                      {Array.isArray(ev.profile_top) && ev.profile_top.length > 0 && (
                        <div className="histBlock">
                          <div className="histLabel">Профиль после (топ)</div>
                          <div className="muted">
                            {ev.profile_top
                              .slice(0, 6)
                              .map((x) => `${x.concept} ${fmt01(Number(x.value))}`)
                              .join(", ")}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {history && history.length > 12 && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Показаны последние 12 событий.
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "support" && (
            <div className="grid2" style={{ marginTop: 14 }}>
              <div className="panel">
                <div className="panelTitle">Как поддержать чтение</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Это подсказки для родителя: как мягко развивать дефицитные темы через обсуждение и небольшие практики.
                </div>

                <div style={{ marginTop: 12 }}>
                  {supportTips.length === 0 ? (
                    <div className="muted">Нет дефицитов — можно углублять сильные темы и просто поддерживать привычку чтения.</div>
                  ) : (
                    <div className="tipsList">
                      {supportTips.map((t) => (
                        <div key={t.title} className="tipCard">
                          <div className="tipTitle">{t.title}</div>
                          <ul className="ul" style={{ marginTop: 8 }}>
                            {t.items.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panelTitle">Что видно в рекомендациях</div>
                <ul className="ul" style={{ marginTop: 10 }}>
                  <li>
                    <b>Соответствие (%)</b> — насколько книга подходит текущему профилю ребёнка (относительно топ-рекомендации).
                  </li>
                  <li>
                    <b>Режим</b> — “коррекция дефицитов” или “углубление сильных тем”.
                  </li>
                  <li>
                    <b>Закрывает дефициты</b> — какие темы книга помогает развивать.
                  </li>
                </ul>
                <div className="note">
                  Важно: профиль обновляется накопительно (тексты + анкеты), поэтому цифры со временем меняются — это нормальная “динамика”.
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

/* -------------------------- Parent support tips -------------------------- */

function buildSupportTips(deficits: string[]) {
  const has = (key: string) => deficits.includes(key);

  const tips: Array<{ title: string; items: string[] }> = [];

  if (has("смысл_жизни")) {
    tips.push({
      title: "Смысл_жизни — поддержка дома",
      items: [
        "После чтения задавайте 2 вопроса: «Что герой хотел?» и «Что он понял в конце?»",
        "Обсуждайте цели: «Чему эта история учит?» без морализаторства.",
        "Попросите ребёнка выбрать 1 цитату/идею, которая зацепила, и объяснить почему.",
      ],
    });
  }

  if (has("нравственный_выбор")) {
    tips.push({
      title: "Нравственный_выбор — поддержка дома",
      items: [
        "Обсуждайте альтернативы: «Какие были варианты у героя?»",
        "Спросите: «Какое решение было бы честным/справедливым? Почему?»",
        "Не оценивайте ребёнка; оценивайте ситуацию: «Что бы изменилось, если…»",
      ],
    });
  }

  if (has("честь_и_достоинство")) {
    tips.push({
      title: "Честь_и_достоинство — поддержка дома",
      items: [
        "Обсуждайте границы: «Где герой поступился собой? Где сохранил достоинство?»",
        "Вопрос дня: «Что значит уважать себя и других?»",
        "Хвалите конкретные действия: «Ты спокойно отстоял своё мнение — это достойно».",
      ],
    });
  }

  if (has("любовь")) {
    tips.push({
      title: "Любовь/эмпатия — поддержка дома",
      items: [
        "Спросите: «Что герой чувствовал? Как это видно по поступкам?»",
        "Игра «смена ролей»: «Как бы ты поступил на месте героя?»",
        "Подчёркивайте, что эмоции нормальны — важны действия и ответственность.",
      ],
    });
  }

  if (has("саморазвитие")) {
    tips.push({
      title: "Саморазвитие — поддержка дома",
      items: [
        "После книги: «Какая привычка/идея пригодится в жизни?»",
        "Маленькие цели: 10–15 минут чтения в день лучше, чем «много раз в неделю».",
        "Фиксируйте прогресс: 1–2 предложения «что нового узнал».",
      ],
    });
  }

  if (has("свобода")) {
    tips.push({
      title: "Свобода — поддержка дома",
      items: [
        "Давайте выбор: «Какую книгу читать следующей?» или «когда удобнее читать?»",
        "Обсуждайте ответственность выбора: «Что ты получишь/потеряешь?»",
        "Учите говорить «нет» и аргументировать спокойно.",
      ],
    });
  }

  if (has("ответственность")) {
    tips.push({
      title: "Ответственность — поддержка дома",
      items: [
        "Договор “микро-обязательства”: чтение 10 минут и короткий пересказ.",
        "Обсуждайте последствия поступков героев: «К чему привело?»",
        "Хвалите за завершение: «Ты довёл до конца — это важно».",
      ],
    });
  }

  if (has("коллективизм")) {
    tips.push({
      title: "Коллективизм — поддержка дома",
      items: [
        "Совместное чтение/обсуждение 1 раз в неделю (20 минут).",
        "Вопрос: «Кому герой помог? Кто помог герою? Почему это важно?»",
        "Мини-проекты: сделать общий список книг/цитат «что обсуждаем дома».",
      ],
    });
  }

  if (has("патриотизм")) {
    tips.push({
      title: "Патриотизм/культура — поддержка дома",
      items: [
        "Связывайте книгу с контекстом: место, эпоха, традиции (без лекций).",
        "Вопрос: «Что в этой истории про нашу культуру/общество?»",
        "Поддержка интереса: фильмы/музеи/места, связанные с произведением (по желанию).",
      ],
    });
  }

  return tips;
}

/* -------------------------- Styles -------------------------- */

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

      .childBar{
        margin-top: 14px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 12px;
        display:flex;
        justify-content: space-between;
        gap: 14px;
        background: rgba(255,255,255,.95);
      }
      .childLeft{ flex: 1; min-width: 320px; }
      .childRight{ display:flex; gap:10px; align-items: stretch; }
      .miniCard{
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 10px 12px;
        background: #fff;
        min-width: 160px;
      }
      .miniTitle{ font-size: 12px; color: rgba(20,25,35,.65); font-weight: 700; }
      .miniValue{ margin-top: 6px; font-size: 18px; font-weight: 850; }

      .gridParent {
        display:grid;
        grid-template-columns: 360px 1fr 360px;
        gap:14px;
        margin-top: 14px;
        align-items: start;
      }
      .grid2 {
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap:14px;
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

      .labelSmall { font-size: 12px; color: rgba(20,25,35,.7); font-weight: 700; margin-bottom: 6px; }
      .input {
        width: 420px;
        max-width: 100%;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
      }

      .chips { display:flex; flex-wrap: wrap; gap:8px; margin-top: 8px; }
      .chip {
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(60,110,255,.22);
        background: rgba(60,110,255,.07);
        font-size: 13px;
      }
      .chipWarn{
        border-color: rgba(255,140,0,.22);
        background: rgba(255,140,0,.08);
      }
      .chipOk{
        border-color: rgba(0,180,120,.20);
        background: rgba(0,180,120,.08);
      }
      .chipBtn{
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.10);
        background: #fff;
        padding: 7px 10px;
        cursor:pointer;
        font-weight: 650;
        color: rgba(20,25,35,.85);
      }
      .chipBtnActive{
        border-color: rgba(60,110,255,.65);
        box-shadow: 0 0 0 3px rgba(60,110,255,.10);
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

      .recsList { display:flex; flex-direction: column; gap:12px; margin-top: 12px; }
      .recCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: #fff;
      }
      .recTop { display:flex; flex-direction: column; gap:4px; }
      .recTitle { font-weight: 850; font-size: 18px; }

      .histList { display:flex; flex-direction: column; gap:10px; margin-top: 12px; }
      .histCard{
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 12px;
        background: #fff;
      }
      .histTop{ display:flex; align-items:flex-start; justify-content: space-between; gap: 10px; }
      .histTitle{ font-weight: 850; }
      .histBlock{ margin-top: 8px; }
      .histLabel{ font-size: 12px; font-weight: 800; color: rgba(20,25,35,.65); }

      .tipsList{ display:flex; flex-direction: column; gap:12px; margin-top: 10px; }
      .tipCard{
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: #fff;
      }
      .tipTitle{ font-weight: 850; font-size: 16px; }

      @media (max-width: 1180px) {
        .gridParent { grid-template-columns: 1fr; }
        .childBar{ flex-direction: column; }
        .childRight{ justify-content: flex-start; flex-wrap: wrap; }
      }
      @media (max-width: 980px) {
        .grid2 { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
