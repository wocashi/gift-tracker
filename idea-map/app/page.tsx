"use client";

import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from "react";
import dynamic from "next/dynamic";
import type { NewsOverlay } from "@/components/IdeaMap";

const IdeaMap = dynamic(() => import("@/components/IdeaMap"), { ssr: false });

interface Idea {
  id: string;
  text: string;
  url?: string;
  memo?: string;
  image?: string;
}

interface PositionedIdea extends Idea {
  x: number;
  y: number;
  clusterId: string;
}

interface Cluster {
  id: string;
  label: string;
  summary: string;
  color: string;
}

interface MapData {
  ideas: PositionedIdea[];
  clusters: Cluster[];
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const STORAGE_KEY = "idea-map-ideas";

export default function Home() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [input, setInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlFetching, setUrlFetching] = useState(false);
  const [urlSummarizing, setUrlSummarizing] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [detailIdea, setDetailIdea] = useState<{ idea: PositionedIdea; cluster: Cluster | null } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null);
  const [editingClusterLabel, setEditingClusterLabel] = useState("");
  const [newsOverlay, setNewsOverlay] = useState<NewsOverlay | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setIdeas(JSON.parse(saved));
  }, []);

  // detailIdea が開かれたらニュースを取得してマップ上にオーバーレイ
  useEffect(() => {
    if (!detailIdea?.cluster) { setNewsOverlay(null); return; }
    const { idea, cluster } = detailIdea;
    const clusterIdeas = mapData?.ideas.filter(i => i.clusterId === idea.clusterId).map(i => i.text) ?? [];
    fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: cluster.label, summary: cluster.summary, ideas: clusterIdeas }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.queries) setNewsOverlay({ ideaId: idea.id, queries: data.queries });
      })
      .catch(() => {});
    return () => setNewsOverlay(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailIdea?.idea.id]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // URLが貼られたら自動でタイトル取得
  useEffect(() => {
    const trimmed = urlInput.trim();
    if (!trimmed.match(/^https?:\/\/.+/)) return;
    const timer = setTimeout(async () => {
      setUrlFetching(true);
      try {
        const res = await fetch(`/api/ogp?url=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data.title && data.title !== trimmed) {
          setInput(prev => prev || data.title);
        }
      } catch { /* ignore */ } finally {
        setUrlFetching(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [urlInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  }, [ideas]);

  // URLの内容をClaudeで要約してアイデアとして追加
  async function summarizeAndAdd() {
    const url = urlInput.trim();
    if (!url.match(/^https?:\/\/.+/)) return;
    setUrlSummarizing(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.summary) {
        setIdeas(prev => [...prev, { id: generateId(), text: data.summary, url }]);
        setUrlInput("");
        setInput("");
      }
    } catch { /* ignore */ } finally {
      setUrlSummarizing(false);
    }
  }

  function addIdea() {
    const text = input.trim();
    if (!text) return;
    const url = urlInput.trim() || undefined;
    setIdeas(prev => [...prev, { id: generateId(), text, url }]);
    setInput("");
    setUrlInput("");
    inputRef.current?.focus();
  }

  function removeIdea(id: string) {
    setIdeas(prev => prev.filter(i => i.id !== id));
    if (mapData) {
      setMapData(prev => prev ? { ...prev, ideas: prev.ideas.filter(i => i.id !== id) } : null);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addIdea();
    }
  }

  async function generateMap() {
    if (ideas.length < 2) {
      setError("アイデアを2件以上入力してください");
      return;
    }
    setLoading(true);
    setError("");
    setSelectedCluster(null);
    setDetailIdea(null);
    if (isMobile) setSidebarOpen(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "エラーが発生しました");
      }
      const data: MapData = await res.json();
      const ideaMap = new Map(ideas.map(i => [i.id, i]));
      const enriched = {
        ...data,
        ideas: data.ideas.map(i => ({
          ...i,
          text: ideaMap.get(i.id)?.text ?? i.id,
          memo: ideaMap.get(i.id)?.memo,
          image: ideaMap.get(i.id)?.image,
        })),
      };
      setMapData(enriched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function saveDetail(id: string, memo: string, image?: string) {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, memo, image } : i));
    setMapData(prev => prev ? {
      ...prev,
      ideas: prev.ideas.map(i => i.id === id ? { ...i, memo, image } : i),
    } : null);
  }

  function clearAll() {
    setIdeas([]);
    setMapData(null);
    setError("");
    setSelectedCluster(null);
    setDetailIdea(null);
    setConfirmClear(false);
  }

  function startEditCluster(cluster: Cluster) {
    setEditingClusterId(cluster.id);
    setEditingClusterLabel(cluster.label);
  }

  function saveClusterLabel() {
    const label = editingClusterLabel.trim();
    if (!label || !editingClusterId) { setEditingClusterId(null); return; }
    setMapData(prev => prev ? {
      ...prev,
      clusters: prev.clusters.map(c => c.id === editingClusterId ? { ...c, label } : c),
    } : null);
    setSelectedCluster(prev => prev?.id === editingClusterId ? { ...prev, label } : prev);
    setEditingClusterId(null);
  }

  const clusterForDisplay = mapData?.clusters ?? [];
  const ideaCount = ideas.length;

  // ── サイドバー共通コンテンツ ──────────────────────────────
  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 pb-3" style={{ borderBottom: "2px solid var(--border)" }}>
        <span style={{ fontSize: 24 }}>🧠</span>
        <div>
          <div className="font-black text-lg tracking-tight" style={{ color: "var(--text)" }}>IdeaMap</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>思考を地図にする</div>
        </div>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-full w-8 h-8 flex items-center justify-center text-lg"
            style={{ background: "var(--border)", color: "var(--text-muted)" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* アイデア入力 */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
          💡 アイデアを追加
        </label>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="アイデアを入力… (Enterで追加)"
          rows={3}
          className="w-full resize-none rounded-xl p-3 text-sm outline-none"
          style={{
            background: "#faf9ff",
            border: "2px solid var(--border)",
            color: "var(--text)",
            lineHeight: 1.6,
            transition: "border-color 0.15s",
          }}
          onFocus={e => (e.target.style.borderColor = "#c4b3f8")}
          onBlur={e => (e.target.style.borderColor = "var(--border)")}
        />
        {/* URL入力 */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#faf9ff", border: "2px solid var(--border)" }}>
          <span style={{ fontSize: 13 }}>🔗</span>
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="URL（任意）"
            className="flex-1 text-sm outline-none"
            style={{ background: "transparent", color: "var(--text)" }}
          />
          {urlFetching && <span className="text-xs opacity-50">⏳</span>}
          {urlInput && !urlFetching && (
            <button onClick={() => setUrlInput("")} className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
          )}
        </div>

        {/* URL要約ボタン */}
        {urlInput.match(/^https?:\/\/.+/) && (
          <button
            onClick={summarizeAndAdd}
            disabled={urlSummarizing}
            className="rounded-xl py-2 px-3 text-xs font-bold transition-all"
            style={{
              background: urlSummarizing ? "#e4e0f5" : "#ede9fe",
              color: "var(--accent)",
              border: "1.5px solid #c4b3f8",
            }}
          >
            {urlSummarizing ? "⏳ 要約中…" : "📰 URLの内容を要約して追加"}
          </button>
        )}

        <button
          onClick={addIdea}
          disabled={!input.trim()}
          className="rounded-xl py-2 px-4 text-sm font-bold transition-all btn-primary"
        >
          ＋ 追加
        </button>
      </div>

      {/* アイデア一覧 */}
      {ideas.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
              📌 アイデア一覧 ({ideaCount})
            </label>
            {confirmClear ? (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>本当に？</span>
                <button onClick={clearAll} className="text-xs rounded-md px-2 py-0.5 font-bold" style={{ color: "white", background: "#e11d48" }}>削除</button>
                <button onClick={() => setConfirmClear(false)} className="text-xs rounded-md px-2 py-0.5" style={{ color: "var(--text-muted)", background: "#f0ecff" }}>戻る</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="text-xs rounded-md px-2 py-0.5" style={{ color: "var(--text-muted)", background: "#f0ecff" }}>全削除</button>
            )}
          </div>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {ideas.map((idea, i) => (
              <div key={idea.id} className="idea-card flex items-start gap-2 group">
                <span className="flex-shrink-0 rounded-full text-xs font-bold flex items-center justify-center mt-0.5" style={{ width: 18, height: 18, background: "#ede9fe", color: "var(--accent)", fontSize: 10 }}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm leading-snug" style={{ color: "var(--text)" }}>
                  {idea.text}
                  {idea.memo && <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>📝</span>}
                  {idea.image && <span className="ml-1 text-xs">🖼️</span>}
                </span>
                {idea.url && (
                  <a href={idea.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity text-sm" title={idea.url}>🔗</a>
                )}
                <button onClick={() => removeIdea(idea.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-xs flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 生成ボタン */}
      <button
        onClick={generateMap}
        disabled={loading || ideaCount < 2}
        className="rounded-2xl py-3.5 px-4 text-sm font-black transition-all btn-primary"
        style={{ letterSpacing: "0.02em", fontSize: 15 }}
      >
        {loading ? "🌀 マップ生成中…" : "✨ マップを生成する"}
      </button>

      {ideaCount === 1 && (
        <p className="text-xs text-center" style={{ color: "var(--text-muted)", marginTop: -8 }}>
          あと1件追加すると生成できます
        </p>
      )}

      {error && (
        <div className="text-xs rounded-xl p-3" style={{ background: "#fff0f3", color: "#e11d48", border: "1.5px solid #fecdd3" }}>
          {error}
        </div>
      )}

      {/* クラスター一覧 */}
      {clusterForDisplay.length > 0 && (
        <div className="flex flex-col gap-2" style={{ borderTop: "2px solid var(--border)", paddingTop: 14 }}>
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            🎨 クラスター
          </label>
          {clusterForDisplay.map(cluster => (
            <div
              key={cluster.id}
              className="rounded-xl p-2.5 transition-all"
              style={{
                background: selectedCluster?.id === cluster.id ? cluster.color + "15" : "#faf9ff",
                border: `2px solid ${selectedCluster?.id === cluster.id ? cluster.color : "var(--border)"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full flex-shrink-0" style={{ width: 10, height: 10, background: cluster.color }} />
                {editingClusterId === cluster.id ? (
                  <input
                    autoFocus
                    value={editingClusterLabel}
                    onChange={e => setEditingClusterLabel(e.target.value)}
                    onBlur={saveClusterLabel}
                    onKeyDown={e => { if (e.key === "Enter") saveClusterLabel(); if (e.key === "Escape") setEditingClusterId(null); }}
                    className="flex-1 text-sm font-bold rounded-md px-1 outline-none"
                    style={{ border: `1.5px solid ${cluster.color}`, color: "var(--text)", background: "white" }}
                  />
                ) : (
                  <button
                    className="flex-1 text-left text-sm font-bold"
                    style={{ color: "var(--text)" }}
                    onClick={() => setSelectedCluster(prev => prev?.id === cluster.id ? null : cluster)}
                  >
                    {cluster.label}
                  </button>
                )}
                <button onClick={() => startEditCluster(cluster)} className="text-xs opacity-40 hover:opacity-100 transition-opacity" title="名前を編集">✏️</button>
              </div>
              {selectedCluster?.id === cluster.id && editingClusterId !== cluster.id && (
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {cluster.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── デスクトップサイドバー ── */}
      {!isMobile && (
        <aside
          className="flex flex-col gap-4 p-5 overflow-y-auto flex-shrink-0"
          style={{
            width: 300,
            borderRight: "2px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "4px 0 24px rgba(124,58,237,0.06)",
          }}
        >
          {sidebarContent}
        </aside>
      )}

      {/* ── モバイルドロワー ── */}
      {isMobile && sidebarOpen && (
        <>
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.35)" }}
            onClick={() => setSidebarOpen(false)}
          />
          {/* ドロワー本体 */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-4 p-5 overflow-y-auto rounded-t-3xl"
            style={{
              background: "var(--surface)",
              maxHeight: "88vh",
              boxShadow: "0 -8px 40px rgba(124,58,237,0.18)",
            }}
          >
            {/* ドラッグハンドル */}
            <div className="flex justify-center -mt-1 mb-1">
              <div className="rounded-full" style={{ width: 36, height: 4, background: "var(--border)" }} />
            </div>
            {sidebarContent}
          </div>
        </>
      )}

      {/* ── マップエリア ── */}
      <main className="flex-1 relative overflow-hidden" style={{ background: "#f0eeff" }}>
        {mapData && mapData.ideas.length > 0 ? (
          <IdeaMap
            ideas={mapData.ideas}
            clusters={mapData.clusters}
            newsOverlay={newsOverlay}
            onIdeaClick={(idea, cluster) => setDetailIdea({ idea, cluster })}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-6">
            <div style={{ fontSize: isMobile ? 60 : 80 }}>🧠</div>
            <div className="text-center">
              <p className="font-black text-xl mb-2 tracking-widest uppercase" style={{ color: "#1e1a3a", fontFamily: "Georgia, serif" }}>
                IDEA MAP
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#8b85a8" }}>
                アイデアを入力すると、AIが<br />クラスターマップを描き出します
              </p>
            </div>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-2xl py-3 px-8 text-sm font-black btn-primary mt-2"
              >
                ＋ アイデアを追加する
              </button>
            )}
          </div>
        )}

        {/* ヒント */}
        {mapData && !detailIdea && (
          <div
            className="absolute text-xs rounded-full px-4 py-2 font-medium"
            style={{
              bottom: isMobile ? 72 : 16,
              right: 16,
              background: "rgba(255,255,255,0.9)",
              border: "1.5px solid var(--border)",
              color: "var(--text-muted)",
              boxShadow: "0 2px 12px rgba(124,58,237,0.08)",
            }}
          >
            🔍 ズーム・ドラッグ｜点をクリックでメモ
          </div>
        )}

        {/* 詳細パネル */}
        {detailIdea && (
          <DetailPanel
            idea={detailIdea.idea}
            cluster={detailIdea.cluster}
            isMobile={isMobile}
            onClose={() => setDetailIdea(null)}
            onSave={(id, memo, image) => { saveDetail(id, memo, image); setDetailIdea(null); }}
          />
        )}
      </main>

      {/* ── モバイル下部フローティングバー ── */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.96)",
            borderTop: "2px solid var(--border)",
            boxShadow: "0 -4px 20px rgba(124,58,237,0.1)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all"
            style={{ background: "#ede9fe", color: "var(--accent)" }}
          >
            <span>📌</span>
            <span>アイデア {ideaCount > 0 ? `(${ideaCount})` : "を追加"}</span>
          </button>

          <button
            onClick={generateMap}
            disabled={loading || ideaCount < 2}
            className="rounded-xl px-5 py-2.5 text-sm font-black btn-primary"
          >
            {loading ? "🌀" : "✨ 生成"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── OGP関連 ──────────────────────────────────────────────

interface OgpData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
}

const URL_REGEX = /https?:\/\/[^\s\])"']+/g;

function useLinkPreviews(text: string) {
  const [previews, setPreviews] = useState<OgpData[]>([]);
  useEffect(() => {
    const urls = Array.from(new Set(text.match(URL_REGEX) ?? [])).slice(0, 3);
    if (urls.length === 0) { setPreviews([]); return; }
    let cancelled = false;
    Promise.all(
      urls.map(u => fetch(`/api/ogp?url=${encodeURIComponent(u)}`).then(r => r.json()).catch(() => null))
    ).then(results => {
      if (!cancelled) setPreviews(results.filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [text]);
  return previews;
}

function LinkCard({ data }: { data: OgpData }) {
  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex gap-3 rounded-xl overflow-hidden" style={{ border: "1.5px solid var(--border)", background: "#fafff7", textDecoration: "none" }}>
      <div className="flex-shrink-0" style={{ width: 4, background: "#16a34a" }} />
      <div className="flex-1 min-w-0 py-2.5 pr-2">
        <div className="text-xs mb-1 truncate" style={{ color: "#2563eb" }}>{data.url}</div>
        <div className="text-sm font-bold leading-snug mb-0.5" style={{ color: "var(--text)" }}>{data.title}</div>
        {data.description && (
          <div className="text-xs leading-relaxed" style={{ color: "var(--text-muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {data.description}
          </div>
        )}
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{data.siteName}</div>
      </div>
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image} alt="" className="flex-shrink-0 object-cover" style={{ width: 72, height: 72 }} onError={e => (e.currentTarget.style.display = "none")} />
      )}
    </a>
  );
}

// ── 詳細パネル ────────────────────────────────────────────

function DetailPanel({
  idea,
  cluster,
  isMobile,
  onClose,
  onSave,
}: {
  idea: PositionedIdea;
  cluster: Cluster | null;
  isMobile: boolean;
  onClose: () => void;
  onSave: (id: string, memo: string, image?: string) => void;
}) {
  const [memo, setMemo] = useState(idea.memo ?? "");
  const [image, setImage] = useState<string | undefined>(idea.image);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkPreviews = useLinkPreviews(memo);

  function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  const panelStyle = isMobile
    ? {
        position: "fixed" as const,
        left: 0, right: 0, bottom: 0,
        height: "88vh",
        borderRadius: "24px 24px 0 0",
        zIndex: 60,
      }
    : {
        position: "absolute" as const,
        top: 12, right: 12, bottom: 12,
        width: 340,
        borderRadius: 20,
        zIndex: 50,
      };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        ...panelStyle,
        background: "rgba(255,255,255,0.97)",
        border: "2px solid var(--border)",
        boxShadow: "0 8px 40px rgba(124,58,237,0.18)",
      }}
    >
      {/* ヘッダー */}
      <div className="flex items-start gap-2 p-4" style={{ borderBottom: "2px solid var(--border)" }}>
        {isMobile && <div className="absolute left-1/2 -translate-x-1/2 top-2 rounded-full" style={{ width: 36, height: 4, background: "var(--border)" }} />}
        <span style={{ fontSize: 20 }}>📍</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-snug" style={{ color: "var(--text)" }}>{idea.text}</p>
          {cluster && (
            <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cluster.color + "20", color: cluster.color }}>
              {cluster.label}
            </span>
          )}
        </div>
        <button onClick={onClose} className="flex-shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold" style={{ background: "var(--border)", color: "var(--text-muted)" }}>✕</button>
      </div>

      {/* 本文 */}
      <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">

        {/* ニュースはマップ上に点で表示中 */}
        {cluster && (
          <div className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: cluster.color + "10", color: cluster.color, border: `1.5px solid ${cluster.color}25` }}>
            <span>📰</span>
            <span>マップ上に関連ニュースを表示中</span>
          </div>
        )}

        {/* メモ */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            📝 メモ
          </label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="メモを入力..."
            rows={4}
            className="w-full resize-none rounded-xl p-3 text-sm outline-none mt-2"
            style={{ background: "#faf9ff", border: "2px solid var(--border)", color: "var(--text)", lineHeight: 1.6 }}
            onFocus={e => (e.target.style.borderColor = "#c4b3f8")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {linkPreviews.length > 0 && (
          <div className="flex flex-col gap-2">
            {linkPreviews.map(p => <LinkCard key={p.url} data={p} />)}
          </div>
        )}

        {/* 画像 */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            🖼️ 画像
          </label>
          {image ? (
            <div className="relative rounded-xl overflow-hidden mt-2" style={{ border: "2px solid var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="添付画像" className="w-full object-cover" style={{ maxHeight: 160 }} />
              <button onClick={() => setImage(undefined)} className="absolute top-2 right-2 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold" style={{ background: "rgba(0,0,0,0.5)", color: "white" }}>✕</button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl py-5 text-sm font-semibold mt-2" style={{ background: "#faf9ff", border: "2px dashed var(--border)", color: "var(--text-muted)" }}>
              + 画像を追加
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* 保存ボタン */}
      <div className="p-4" style={{ borderTop: "2px solid var(--border)" }}>
        <button onClick={() => onSave(idea.id, memo, image)} className="w-full rounded-xl py-3 text-sm font-black btn-primary">
          💾 保存する
        </button>
      </div>
    </div>
  );
}
