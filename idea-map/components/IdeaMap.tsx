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
    const PAD = 72;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const xScale = d3.scaleLinear().domain([0, 100]).range([PAD, W - PAD]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([PAD, H - PAD]);
    const clusterMap = new Map(clusters.map(c => [c.id, c]));

    // ── Zoom ──────────────────────────────────────────────
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 8])
      .on("zoom", (ev) => { g.attr("transform", ev.transform); setTooltip(null); });
    svg.call(zoom);

    // ── 1. 緯経線グリッド ─────────────────────────────────
    const GRID = 7;
    for (let i = 0; i <= GRID; i++) {
      const x = PAD + (W - 2 * PAD) * i / GRID;
      const y = PAD + (H - 2 * PAD) * i / GRID;
      g.append("line")
        .attr("x1", x).attr("y1", PAD).attr("x2", x).attr("y2", H - PAD)
        .attr("stroke", "#7ab8d4").attr("stroke-width", 0.6)
        .attr("stroke-dasharray", "3 7").attr("opacity", 0.45);
      g.append("line")
        .attr("x1", PAD).attr("y1", y).attr("x2", W - PAD).attr("y2", y)
        .attr("stroke", "#7ab8d4").attr("stroke-width", 0.6)
        .attr("stroke-dasharray", "3 7").attr("opacity", 0.45);
    }

    // ── 2. 大陸シェイプ (クラスターごとにConvex Hull) ──────
    const clusterGroups = d3.group(ideas, d => d.clusterId);
    let ci = 0;

    clusterGroups.forEach((cIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;

      const pts = cIdeas.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
      const cx = (d3.mean(pts, p => p[0]) ?? 0);
      const cy = (d3.mean(pts, p => p[1]) ?? 0);
      const EXPAND = 42;

      const drawContinent = (pathD: string) => {
        // 塗り (大陸の内陸) — クリックを通過させる
        g.append("path")
          .attr("d", pathD)
          .attr("fill", cluster.color)
          .attr("opacity", 0)
          .attr("pointer-events", "none")
          .transition().duration(900).delay(ci * 280)
          .attr("opacity", 0.22);

        // 海岸線ストローク
        g.append("path")
          .attr("d", pathD)
          .attr("fill", "none")
          .attr("stroke", cluster.color)
          .attr("stroke-width", 3)
          .attr("stroke-linejoin", "round")
          .attr("opacity", 0)
          .attr("pointer-events", "none")
          .transition().duration(700).delay(ci * 280 + 150)
          .attr("opacity", 0.55);

        g.append("path")
          .attr("d", pathD)
          .attr("fill", "none")
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .attr("stroke-linejoin", "round")
          .attr("stroke-dasharray", "6 4")
          .attr("opacity", 0)
          .attr("pointer-events", "none")
          .transition().duration(700).delay(ci * 280 + 200)
          .attr("opacity", 0.6);
      };

      if (pts.length >= 3) {
        const hull = d3.polygonHull(pts);
        if (hull) {
          const expanded = hull.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            return [x + (dx / len) * EXPAND, y + (dy / len) * EXPAND] as [number, number];
          });
          const lineGen = d3.line<[number, number]>()
            .x(d => d[0]).y(d => d[1])
            .curve(d3.curveCatmullRomClosed.alpha(0.5));
          const pathD = lineGen(expanded);
          if (pathD) drawContinent(pathD);
        }
      } else {
        // 点が少ない場合は円で代替
        const r = EXPAND + 30;
        const circ = `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0`;
        drawContinent(circ);
      }

      ci++;
    });

    // ── 3. 都市マーカー (アイデア) ──────────────────────
    let ii = 0;
    ideas.forEach(idea => {
      const cluster = clusterMap.get(idea.clusterId);
      const color = cluster?.color ?? "#7c3aed";
      const cx = xScale(idea.x);
      const cy = yScale(idea.y);
      const delay = 500 + ii * 55;

      // ハロー (地図の都市マーク外輪) — クリックを通過させる
      g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 0)
        .attr("fill", "none")
        .attr("stroke", color).attr("stroke-width", 1.5).attr("opacity", 0.45)
        .attr("pointer-events", "none")
        .transition().duration(400).delay(delay).attr("r", 13);

      // 内側ドット
      const dot = g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 0)
        .attr("fill", color)
        .attr("stroke", "white").attr("stroke-width", 2)
        .style("cursor", "pointer");

      dot.transition().duration(300).delay(delay).attr("r", 5.5);

      dot.on("mouseover", function (event) {
          d3.select(this).raise().attr("r", 9);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, idea, cluster: cluster ?? null });
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 5.5);
          setTooltip(null);
        })
        .on("click", function () {
          setTooltip(null);
          onIdeaClickRef.current?.(idea, cluster ?? null);
        });

      ii++;
    });

    // ── 4. 地名ラベル (カートグラフィスタイル) ───────────
    ci = 0;
    clusterGroups.forEach((cIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;

      const pts = cIdeas.map(d => [xScale(d.x), yScale(d.y)] as [number, number]);
      const cx = d3.mean(pts, p => p[0]) ?? 0;
      const cy = d3.mean(pts, p => p[1]) ?? 0;

      const lg = g.append("g").attr("opacity", 0).attr("pointer-events", "none");

      // テキスト影（可読性のため）
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        lg.append("text")
          .attr("x", cx + dx).attr("y", cy + dy)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("fill", "white").attr("font-size", "13px").attr("font-weight", "900")
          .attr("letter-spacing", "2.5")
          .style("font-family", "Georgia, 'Times New Roman', serif")
          .text(cluster.label.toUpperCase());
      }

      // メインテキスト
      lg.append("text")
        .attr("x", cx).attr("y", cy)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", cluster.color).attr("font-size", "13px").attr("font-weight", "900")
        .attr("letter-spacing", "2.5")
        .style("font-family", "Georgia, 'Times New Roman', serif")
        .text(cluster.label.toUpperCase());

      lg.transition().duration(500).delay(ci * 280 + 700).attr("opacity", 1);
      ci++;
    });

    // ── 5. コンパスローズ (固定・ズーム外) ───────────────
    const CR = 28;
    const crX = W - CR - 20;
    const crY = H - CR - 20;
    const cr = svg.append("g").attr("transform", `translate(${crX},${crY})`).attr("opacity", 0.75);

    // 外輪
    cr.append("circle").attr("r", CR).attr("fill", "rgba(255,255,255,0.7)")
      .attr("stroke", "#7ab8d4").attr("stroke-width", 1);

    // 方位矢印
    const arrow = (angle: number, color: string, len: number) => {
      const rad = (angle - 90) * Math.PI / 180;
      const tx = Math.cos(rad) * len;
      const ty = Math.sin(rad) * len;
      const lx = Math.cos(rad + Math.PI / 2) * 4;
      const ly = Math.sin(rad + Math.PI / 2) * 4;
      cr.append("polygon")
        .attr("points", `0,0 ${lx},${ly} ${tx},${ty} ${-lx},${-ly}`)
        .attr("fill", color).attr("opacity", 0.9);
    };
    arrow(0, "#2563eb", CR - 4);   // N (青)
    arrow(90, "#94a3b8", CR - 8);  // E
    arrow(180, "#94a3b8", CR - 8); // S
    arrow(270, "#94a3b8", CR - 8); // W

    cr.append("circle").attr("r", 4).attr("fill", "white").attr("stroke", "#2563eb").attr("stroke-width", 1.5);

    // N ラベル
    cr.append("text")
      .attr("y", -(CR - 2)).attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("font-size", "9px").attr("font-weight", "900")
      .style("font-family", "Georgia, serif")
      .attr("fill", "#1e3a5f")
      .text("N");

  }, [ideas, clusters]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" style={{ background: "transparent" }} />
      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 400) - 240),
            top: tooltip.y - 12,
          }}
        >
          <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>
            {tooltip.idea.text}
          </div>
          {tooltip.cluster && (
            <div style={{
              color: tooltip.cluster.color,
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              fontFamily: "Georgia, serif",
            }}>
              {tooltip.cluster.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
