"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface PositionedIdea {
  id: string;
  text: string;
  x: number;
  y: number;
  clusterId: string;
  memo?: string;
  image?: string;
}

interface Cluster {
  id: string;
  label: string;
  summary: string;
  color: string;
}

export interface NewsOverlay {
  ideaId: string;
  queries: string[];
}

interface IdeaMapProps {
  ideas: PositionedIdea[];
  clusters: Cluster[];
  newsOverlay?: NewsOverlay | null;
  onIdeaClick?: (idea: PositionedIdea, cluster: Cluster | null) => void;
}

export default function IdeaMap({ ideas, clusters, newsOverlay, onIdeaClick }: IdeaMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onIdeaClickRef = useRef(onIdeaClick);
  onIdeaClickRef.current = onIdeaClick;

  // スケールと zoom group を他の effect から参照できるよう保存
  const scalesRef = useRef<{
    xScale: d3.ScaleLinear<number, number>;
    yScale: d3.ScaleLinear<number, number>;
  } | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

  const [tooltip, setTooltip] = useState<{
    x: number; y: number;
    text: string; subText?: string; color?: string;
  } | null>(null);

  // ── メインマップ描画 ────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || ideas.length === 0) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const PAD = 60;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const xScale = d3.scaleLinear().domain([0, 100]).range([PAD, W - PAD]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([PAD, H - PAD]);
    const clusterMap = new Map(clusters.map(c => [c.id, c]));

    scalesRef.current = { xScale, yScale };

    // blur filter for soft blobs
    const defs = svg.append("defs");
    clusters.forEach((_, i) => {
      const filter = defs.append("filter")
        .attr("id", `blob-${i}`)
        .attr("x", "-60%").attr("y", "-60%")
        .attr("width", "220%").attr("height", "220%");
      filter.append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", 28);
    });

    // zoom
    const g = svg.append("g");
    gRef.current = g;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 10])
      .on("zoom", (ev) => { g.attr("transform", ev.transform); setTooltip(null); });
    svg.call(zoom);

    const clusterGroups = d3.group(ideas, d => d.clusterId);

    // 1. ソフトブロブ
    let ci = 0;
    clusterGroups.forEach((cIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;
      const pts = cIdeas.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
      const cx = d3.mean(pts, p => p[0]) ?? 0;
      const cy = d3.mean(pts, p => p[1]) ?? 0;
      const maxDist = Math.max(...pts.map(p => Math.sqrt((p[0]-cx)**2 + (p[1]-cy)**2)), 30);
      g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", maxDist + 50)
        .attr("fill", cluster.color).attr("opacity", 0)
        .attr("filter", `url(#blob-${ci})`).attr("pointer-events", "none")
        .transition().duration(1000).delay(ci * 200).attr("opacity", 0.28);
      ci++;
    });

    // 2. ドット
    let ii = 0;
    ideas.forEach(idea => {
      const cluster = clusterMap.get(idea.clusterId);
      const color = cluster?.color ?? "#7c3aed";
      const cx = xScale(idea.x);
      const cy = yScale(idea.y);
      const delay = 300 + ii * 40;

      const dot = g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 0)
        .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1.5)
        .attr("class", `idea-dot idea-dot-${idea.id}`)
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.18))");

      dot.transition().duration(350).delay(delay).attr("r", 5);

      dot
        .on("mouseover", function (event) {
          d3.select(this).raise().attr("r", 8).attr("stroke-width", 2);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, text: idea.text, subText: cluster?.label, color: color });
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 5).attr("stroke-width", 1.5);
          setTooltip(null);
        })
        .on("click", function () {
          setTooltip(null);
          onIdeaClickRef.current?.(idea, cluster ?? null);
        });

      ii++;
    });

    // 3. クラスターラベル
    ci = 0;
    clusterGroups.forEach((cIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;
      const pts = cIdeas.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
      const cx = d3.mean(pts, p => p[0]) ?? 0;
      const cy = d3.mean(pts, p => p[1]) ?? 0;
      const lg = g.append("g").attr("opacity", 0).attr("pointer-events", "none");
      const approxW = cluster.label.length * 8 + 20;
      lg.append("rect").attr("x", cx - approxW/2).attr("y", cy - 13).attr("width", approxW).attr("height", 22).attr("rx", 11).attr("fill", "white").attr("opacity", 0.85);
      lg.append("text").attr("x", cx).attr("y", cy + 1).attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("fill", cluster.color).attr("font-size", "12px").attr("font-weight", "800").style("font-family", "'Helvetica Neue', Arial, sans-serif").text(cluster.label);
      lg.transition().duration(600).delay(ci * 200 + 800).attr("opacity", 1);
      ci++;
    });

  }, [ideas, clusters]);

  // ── ニュースオーバーレイ描画 ─────────────────────────────
  useEffect(() => {
    const g = gRef.current;
    const scales = scalesRef.current;
    if (!g) return;

    // 既存のニュースドットをすべて削除
    g.selectAll(".news-overlay").remove();

    if (!newsOverlay || !scales) return;

    const idea = ideas.find(i => i.id === newsOverlay.ideaId);
    if (!idea) return;

    const cluster = clusters.find(c => c.id === idea.clusterId);
    const color = cluster?.color ?? "#7c3aed";
    const cx = scales.xScale(idea.x);
    const cy = scales.yScale(idea.y);
    const ORBIT = 85;

    // 選択中の親ドットに選択リングを追加
    g.append("circle")
      .attr("class", "news-overlay")
      .attr("cx", cx).attr("cy", cy).attr("r", 0)
      .attr("fill", "none")
      .attr("stroke", color).attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0.7)
      .attr("pointer-events", "none")
      .transition().duration(300).attr("r", 10);

    newsOverlay.queries.forEach((query, i) => {
      const angle = (i / newsOverlay.queries.length) * 2 * Math.PI - Math.PI / 2;
      const nx = cx + Math.cos(angle) * ORBIT;
      const ny = cy + Math.sin(angle) * ORBIT;

      const group = g.append("g")
        .attr("class", "news-overlay")
        .style("cursor", "pointer");

      // 接続線
      group.append("line")
        .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
        .attr("stroke", color).attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 3").attr("opacity", 0.45)
        .transition().duration(350).delay(i * 60)
        .attr("x2", nx).attr("y2", ny);

      // ニュースドット本体
      group.append("circle")
        .attr("cx", nx).attr("cy", ny).attr("r", 0)
        .attr("fill", "white")
        .attr("stroke", color).attr("stroke-width", 2)
        .attr("opacity", 0.95)
        .transition().duration(300).delay(i * 60 + 100).attr("r", 11);

      // 📰 アイコン
      group.append("text")
        .attr("x", nx).attr("y", ny + 1)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("font-size", "11px").attr("opacity", 0)
        .text("📰")
        .transition().duration(200).delay(i * 60 + 200).attr("opacity", 1);

      // ラベル（ドットの外側、短く切り詰め）
      const shortLabel = query.length > 10 ? query.slice(0, 10) + "…" : query;
      const labelOffset = 20;
      const lx = cx + Math.cos(angle) * (ORBIT + labelOffset);
      const ly = cy + Math.sin(angle) * (ORBIT + labelOffset);
      const anchor = Math.cos(angle) > 0.3 ? "start" : Math.cos(angle) < -0.3 ? "end" : "middle";

      group.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "middle")
        .attr("font-size", "10px")
        .attr("font-weight", "700")
        .attr("fill", color)
        .attr("opacity", 0)
        .style("font-family", "'Helvetica Neue', Arial, sans-serif")
        .text(shortLabel)
        .transition().duration(300).delay(i * 60 + 250).attr("opacity", 0.9);

      // ホバー時にフルテキストのツールチップ
      group
        .on("mouseover", (event) => {
          group.select("circle").attr("stroke-width", 3).attr("r", 13);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            text: query,
            subText: "クリックでニュース検索",
            color,
          });
        })
        .on("mouseout", () => {
          group.select("circle").attr("stroke-width", 2).attr("r", 11);
          setTooltip(null);
        })
        .on("click", () => {
          window.open(
            `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP`,
            "_blank"
          );
        });
    });

  }, [newsOverlay, ideas, clusters]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" style={{ background: "transparent" }} />
      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 400) - 220),
            top: Math.max(tooltip.y - 40, 8),
          }}
        >
          <div className="font-semibold text-sm mb-0.5" style={{ color: "var(--text)" }}>
            {tooltip.text}
          </div>
          {tooltip.subText && (
            <div style={{ color: tooltip.color ?? "var(--text-muted)", fontSize: "10px", fontWeight: 700 }}>
              {tooltip.subText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
