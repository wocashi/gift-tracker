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

export interface NewsArticle {
  title: string;
  url: string;
  source?: string;
}

interface IdeaMapProps {
  ideas: PositionedIdea[];
  clusters: Cluster[];
  /** ideaId → その点に紐づく衛星ニュース */
  ideaNewsMap?: Record<string, NewsArticle[]>;
  onIdeaClick?: (idea: PositionedIdea, cluster: Cluster | null) => void;
}

export default function IdeaMap({ ideas, clusters, ideaNewsMap = {}, onIdeaClick }: IdeaMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onIdeaClickRef = useRef(onIdeaClick);
  onIdeaClickRef.current = onIdeaClick;

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
        .attr("data-idea-id", idea.id)
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.18))");

      dot.transition().duration(350).delay(delay).attr("r", 5);

      dot
        .on("mouseover", function (event) {
          d3.select(this).raise().attr("r", 8).attr("stroke-width", 2);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, text: idea.text, subText: cluster?.label, color });
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
      const w = cluster.label.length * 8 + 20;
      lg.append("rect").attr("x", cx - w/2).attr("y", cy - 13).attr("width", w).attr("height", 22).attr("rx", 11).attr("fill", "white").attr("opacity", 0.85);
      lg.append("text").attr("x", cx).attr("y", cy + 1).attr("text-anchor", "middle").attr("dominant-baseline", "middle").attr("fill", cluster.color).attr("font-size", "12px").attr("font-weight", "800").style("font-family", "'Helvetica Neue', Arial, sans-serif").text(cluster.label);
      lg.transition().duration(600).delay(ci * 200 + 800).attr("opacity", 1);
      ci++;
    });

  }, [ideas, clusters]);

  // ── 衛星ニュースドット描画（永続・アニメーション付き）──
  useEffect(() => {
    const g = gRef.current;
    const scales = scalesRef.current;
    if (!g || !scales) return;

    // 既存の衛星をすべて削除して再描画
    g.selectAll(".news-satellite-root").remove();

    Object.entries(ideaNewsMap).forEach(([ideaId, articles]) => {
      if (!articles?.length) return;

      const idea = ideas.find(i => i.id === ideaId);
      if (!idea) return;

      const cluster = clusters.find(c => c.id === idea.clusterId);
      const color = cluster?.color ?? "#7c3aed";
      const cx = scales.xScale(idea.x);
      const cy = scales.yScale(idea.y);
      // 6件以下は1リング、7件以上は内外2リングに分ける
      const INNER = 72;
      const OUTER = 115;
      const innerCount = articles.length <= 6 ? articles.length : Math.ceil(articles.length / 2);

      articles.forEach((article, i) => {
        const isOuter = i >= innerCount;
        const ringCount = isOuter ? articles.length - innerCount : innerCount;
        const ringIndex = isOuter ? i - innerCount : i;
        const ORBIT = isOuter ? OUTER : INNER;
        const angle = (ringIndex / ringCount) * 2 * Math.PI
          - Math.PI / 2
          + (isOuter ? Math.PI / ringCount : 0); // 外リングをずらして重ならないように
        const nx = cx + Math.cos(angle) * ORBIT;
        const ny = cy + Math.sin(angle) * ORBIT;

        const sg = g.append("g")
          .attr("class", "news-satellite-root")
          .attr("transform", `translate(0,0)`)
          .style("cursor", "pointer");

        // 接続線（細くて薄い）
        sg.append("line")
          .attr("x1", cx).attr("y1", cy)
          .attr("x2", nx).attr("y2", ny)
          .attr("stroke", color).attr("stroke-width", 0.8)
          .attr("stroke-dasharray", "3 4")
          .attr("opacity", 0).attr("pointer-events", "none")
          .transition().duration(500).delay(i * 80).attr("opacity", 0.35);

        // 衛星ドット（白丸＋色枠）
        const dot = sg.append("circle")
          .attr("cx", nx).attr("cy", ny).attr("r", 0)
          .attr("fill", "white")
          .attr("stroke", color).attr("stroke-width", 1.8)
          .attr("opacity", 0.9);

        dot.transition().duration(400).delay(i * 80 + 100).attr("r", 10);

        // 📰 アイコン
        const icon = sg.append("text")
          .attr("x", nx).attr("y", ny + 1)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("font-size", "10px").attr("opacity", 0)
          .attr("pointer-events", "none")
          .text("📰");

        icon.transition().duration(300).delay(i * 80 + 250).attr("opacity", 1);

        // ラベル（ドットの外側）
        const shortLabel = article.title.length > 13 ? article.title.slice(0, 13) + "…" : article.title;
        const labelR = ORBIT + (isOuter ? 16 : 18);
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor = Math.cos(angle) > 0.25 ? "start" : Math.cos(angle) < -0.25 ? "end" : "middle";

        const label = sg.append("text")
          .attr("x", lx).attr("y", ly)
          .attr("text-anchor", anchor)
          .attr("dominant-baseline", "middle")
          .attr("font-size", "9.5px").attr("font-weight", "700")
          .attr("fill", color).attr("opacity", 0)
          .attr("pointer-events", "none")
          .style("font-family", "'Helvetica Neue', Arial, sans-serif")
          .text(shortLabel);

        label.transition().duration(300).delay(i * 80 + 300).attr("opacity", 0.85);

        // ── ふわふわアニメーション（D3 繰り返しtransition）──
        const FLOAT_AMP = 3.5;
        const FLOAT_DUR = 2200 + i * 350;
        const PHASE_DELAY = i * 450;

        function floatCycle(direction: 1 | -1) {
          dot.transition()
            .duration(FLOAT_DUR / 2)
            .ease(d3.easeSinInOut)
            .attr("cy", ny + direction * FLOAT_AMP)
            .on("end", () => floatCycle(-direction as 1 | -1));
          icon.transition()
            .duration(FLOAT_DUR / 2)
            .ease(d3.easeSinInOut)
            .attr("y", ny + 1 + direction * FLOAT_AMP);
        }

        setTimeout(() => floatCycle(-1), i * 80 + 350 + PHASE_DELAY);

        // ホバー & クリック
        sg.on("mouseover", (event) => {
            dot.interrupt().attr("stroke-width", 2.8).attr("r", 13);
            const rect = containerRef.current!.getBoundingClientRect();
            setTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              text: article.title,
              subText: "クリックでニュース検索 →",
              color,
            });
          })
          .on("mouseout", () => {
            dot.attr("stroke-width", 1.8).attr("r", 10);
            setTooltip(null);
          })
          .on("click", () => {
            window.open(article.url, "_blank");
          });
      });
    });

  // ideaNewsMapが変わったとき（保存時）に再描画。ideas/clustersが変わったときも再描画。
  }, [ideaNewsMap, ideas, clusters]);

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
