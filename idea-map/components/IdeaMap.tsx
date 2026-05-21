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

interface IdeaMapProps {
  ideas: PositionedIdea[];
  clusters: Cluster[];
  onIdeaClick?: (idea: PositionedIdea, cluster: Cluster | null) => void;
}

export default function IdeaMap({ ideas, clusters, onIdeaClick }: IdeaMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onIdeaClickRef = useRef(onIdeaClick);
  onIdeaClickRef.current = onIdeaClick;
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; idea: PositionedIdea; cluster: Cluster | null;
  } | null>(null);

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

    // ── defs: blur filters for soft blobs ──────────────────
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

    // ── zoom ───────────────────────────────────────────────
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 10])
      .on("zoom", (ev) => { g.attr("transform", ev.transform); setTooltip(null); });
    svg.call(zoom);

    const clusterGroups = d3.group(ideas, d => d.clusterId);

    // ── 1. ソフトブロブ（クラスター背景）─────────────────
    let ci = 0;
    clusterGroups.forEach((cIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;

      const pts = cIdeas.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
      const cx = (d3.mean(pts, p => p[0]) ?? 0);
      const cy = (d3.mean(pts, p => p[1]) ?? 0);

      // クラスター半径 = 点の広がり + 固定パディング
      const maxDist = Math.max(
        ...pts.map(p => Math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2)),
        30
      );
      const r = maxDist + 50;

      g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", r)
        .attr("fill", cluster.color)
        .attr("opacity", 0)
        .attr("filter", `url(#blob-${ci})`)
        .attr("pointer-events", "none")
        .transition().duration(1000).delay(ci * 200)
        .attr("opacity", 0.28);

      ci++;
    });

    // ── 2. ドット（アイデア）──────────────────────────────
    let ii = 0;
    ideas.forEach(idea => {
      const cluster = clusterMap.get(idea.clusterId);
      const color = cluster?.color ?? "#7c3aed";
      const cx = xScale(idea.x);
      const cy = yScale(idea.y);
      const delay = 300 + ii * 40;

      const dot = g.append("circle")
        .attr("cx", cx).attr("cy", cy)
        .attr("r", 0)
        .attr("fill", color)
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.18))");

      dot.transition().duration(350).delay(delay)
        .attr("r", 5);

      dot
        .on("mouseover", function (event) {
          d3.select(this).raise().attr("r", 8).attr("stroke-width", 2);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, idea, cluster: cluster ?? null });
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

    // ── 3. クラスターラベル ────────────────────────────────
    ci = 0;
    clusterGroups.forEach((cIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;

      const pts = cIdeas.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
      const cx = d3.mean(pts, p => p[0]) ?? 0;
      const cy = d3.mean(pts, p => p[1]) ?? 0;

      const lg = g.append("g").attr("opacity", 0).attr("pointer-events", "none");

      // 背景ピル
      const label = cluster.label;
      const approxW = label.length * 8 + 20;
      lg.append("rect")
        .attr("x", cx - approxW / 2).attr("y", cy - 13)
        .attr("width", approxW).attr("height", 22)
        .attr("rx", 11)
        .attr("fill", "white")
        .attr("opacity", 0.85);

      // テキスト
      lg.append("text")
        .attr("x", cx).attr("y", cy + 1)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", cluster.color)
        .attr("font-size", "12px")
        .attr("font-weight", "800")
        .attr("letter-spacing", "0.5")
        .style("font-family", "'Helvetica Neue', Arial, sans-serif")
        .text(label);

      lg.transition().duration(600).delay(ci * 200 + 800).attr("opacity", 1);
      ci++;
    });

  }, [ideas, clusters]);

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
            {tooltip.idea.text}
          </div>
          {tooltip.cluster && (
            <div style={{
              color: tooltip.cluster.color,
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.5px",
            }}>
              {tooltip.cluster.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
