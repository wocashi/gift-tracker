"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import dynamic from "next/dynamic";

const IdeaMap = dynamic(() => import("@/components/IdeaMap"), { ssr: false });

interface Idea {
  id: string;
  text: string;
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
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setIdeas(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  }, [ideas]);

  function addIdea() {
    const text = input.trim();
    if (!text) return;
    setIdeas(prev => [...prev, { id: generateId(), text }]);
    setInput("");
    inputRef.current?.focus();
  }

  function removeIdea(id: string) {
    setIdeas(prev => prev.filter(i => i.id !== id));
    if (mapData) {
      setMapData(prev => prev ? {
        ...prev,
        ideas: prev.ideas.filter(i => i.id !== id),
      } : null);
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
      // アイデアのテキストをマッピング
      const ideaTextMap = new Map(ideas.map(i => [i.id, i.text]));
      const enriched = {
        ...data,
        ideas: data.ideas.map(i => ({
          ...i,
          text: ideaTextMap.get(i.id) ?? i.id,
        })),
      };
      setMapData(enriched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setIdeas([]);
    setMapData(null);
    setError("");
    setSelectedCluster(null);
  }

  const clusterForDisplay = mapData?.clusters ?? [];
  const ideaCount = ideas.length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* サイドバー */}
      <aside
        className="flex flex-col gap-4 p-4 overflow-y-auto flex-shrink-0"
        style={{
          width: 300,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {/* タイトル */}
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 20 }}>🗺️</span>
          <span className="font-bold text-lg" style={{ color: "var(--text)" }}>IdeaMap</span>
        </div>

        {/* 入力エリア */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            アイデアを追加
          </label>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="アイデアを入力... (Enter で追加)"
            rows={3}
            className="w-full resize-none rounded-lg p-3 text-sm outline-none focus:ring-1"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={addIdea}
            disabled={!input.trim()}
            className="rounded-lg py-2 px-4 text-sm font-semibold transition-all"
            style={{
              background: input.trim() ? "var(--accent)" : "var(--border)",
              color: input.trim() ? "white" : "var(--text-muted)",
              cursor: input.trim() ? "pointer" : "default",
            }}
          >
            + 追加
          </button>
        </div>

        {/* アイデアリスト */}
        {ideas.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                アイデア ({ideaCount})
              </label>
              <button
                onClick={clearAll}
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                全削除
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {ideas.map(idea => (
                <div
                  key={idea.id}
                  className="flex items-start gap-2 rounded-md p-2 group"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <span className="flex-1 text-sm leading-snug" style={{ color: "var(--text)" }}>
                    {idea.text}
                  </span>
                  <button
                    onClick={() => removeIdea(idea.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs flex-shrink-0 mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 生成ボタン */}
        <button
          onClick={generateMap}
          disabled={loading || ideaCount < 2}
          className="rounded-lg py-3 px-4 text-sm font-bold transition-all mt-auto"
          style={{
            background: loading || ideaCount < 2
              ? "var(--border)"
              : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: loading || ideaCount < 2 ? "var(--text-muted)" : "white",
            cursor: loading || ideaCount < 2 ? "default" : "pointer",
          }}
        >
          {loading ? "🔄 マップ生成中..." : "✨ マップを生成"}
        </button>

        {error && (
          <div className="text-xs rounded-md p-2" style={{ background: "#3f1f1f", color: "#f87171", border: "1px solid #7f1d1d" }}>
            {error}
          </div>
        )}

        {/* クラスター一覧 */}
        {clusterForDisplay.length > 0 && (
          <div className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              クラスター
            </label>
            {clusterForDisplay.map(cluster => (
              <button
                key={cluster.id}
                onClick={() => setSelectedCluster(prev => prev?.id === cluster.id ? null : cluster)}
                className="text-left rounded-lg p-2 transition-all"
                style={{
                  background: selectedCluster?.id === cluster.id ? "var(--bg)" : "transparent",
                  border: `1px solid ${selectedCluster?.id === cluster.id ? cluster.color : "var(--border)"}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{ width: 10, height: 10, background: cluster.color }}
                  />
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    {cluster.label}
                  </span>
                </div>
                {selectedCluster?.id === cluster.id && (
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {cluster.summary}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* マップエリア */}
      <main className="flex-1 relative overflow-hidden">
        {mapData && mapData.ideas.length > 0 ? (
          <IdeaMap ideas={mapData.ideas} clusters={mapData.clusters} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--text-muted)" }}>
            <div style={{ fontSize: 64, opacity: 0.3 }}>🗺️</div>
            <div className="text-center">
              <p className="font-semibold text-lg mb-1" style={{ color: "var(--text)" }}>
                アイデアマップ
              </p>
              <p className="text-sm">
                左サイドバーにアイデアを入力して<br />「マップを生成」を押してください
              </p>
            </div>
            {ideaCount > 0 && ideaCount < 2 && (
              <p className="text-xs" style={{ color: "#f59e0b" }}>
                あと {2 - ideaCount} 件以上追加するとマップを生成できます
              </p>
            )}
          </div>
        )}

        {/* ズーム操作ヒント */}
        {mapData && (
          <div
            className="absolute bottom-4 right-4 text-xs rounded-md px-3 py-1.5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            スクロールでズーム・ドラッグでパン
          </div>
        )}
      </main>
    </div>
  );
}
