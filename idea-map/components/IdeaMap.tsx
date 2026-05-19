"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface PositionedIdea {
  id: string;
  text: string;
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

interface IdeaMapProps {
  ideas: PositionedIdea[];
  clusters: Cluster[];
}

export default function IdeaMap({ ideas, clusters }: IdeaMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; idea: PositionedIdea; cluster: Cluster | null } | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || ideas.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const padding = 60;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const xScale = d3.scaleLinear().domain([0, 100]).range([padding, width - padding]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([padding, height - padding]);

    const clusterMap = new Map(clusters.map(c => [c.id, c]));

    // ズーム設定
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setTooltip(null);
      });
    svg.call(zoom);

    // クラスターごとに背景blob描画
    const clusterGroups = d3.group(ideas, d => d.clusterId);
    clusterGroups.forEach((clusterIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster || clusterIdeas.length === 0) return;

      const cx = d3.mean(clusterIdeas, d => xScale(d.x)) ?? 0;
      const cy = d3.mean(clusterIdeas, d => yScale(d.y)) ?? 0;
      const spread = Math.max(
        40,
        d3.max(clusterIdeas, d => Math.hypot(xScale(d.x) - cx, yScale(d.y) - cy)) ?? 40
      ) + 30;

      g.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", spread)
        .attr("fill", cluster.color)
        .attr("opacity", 0.08)
        .attr("stroke", cluster.color)
        .attr("stroke-opacity", 0.2)
        .attr("stroke-width", 1.5);
    });

    // アイデアの点を描画
    ideas.forEach(idea => {
      const cluster = clusterMap.get(idea.clusterId);
      const color = cluster?.color ?? "#6366f1";
      const cx = xScale(idea.x);
      const cy = yScale(idea.y);

      g.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 6)
        .attr("fill", color)
        .attr("opacity", 0.85)
        .attr("stroke", "rgba(255,255,255,0.15)")
        .attr("stroke-width", 1)
        .attr("class", "idea-dot")
        .style("cursor", "pointer")
        .on("mouseover", function (event) {
          d3.select(this).attr("r", 9).attr("opacity", 1);
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            idea,
            cluster: cluster ?? null,
          });
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 6).attr("opacity", 0.85);
          setTooltip(null);
        });
    });

    // クラスターラベル描画
    clusterGroups.forEach((clusterIdeas, clusterId) => {
      const cluster = clusterMap.get(clusterId);
      if (!cluster) return;

      const cx = d3.mean(clusterIdeas, d => xScale(d.x)) ?? 0;
      const minY = d3.min(clusterIdeas, d => yScale(d.y)) ?? 0;
      const labelY = minY - 20;

      const bg = g.append("rect")
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("fill", cluster.color)
        .attr("opacity", 0.9);

      const text = g.append("text")
        .attr("x", cx)
        .attr("y", labelY)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .text(cluster.label);

      const bbox = (text.node() as SVGTextElement).getBBox();
      bg.attr("x", bbox.x - 8)
        .attr("y", bbox.y - 4)
        .attr("width", bbox.width + 16)
        .attr("height", bbox.height + 8);

      text.raise();
    });

    // 初回フィット
    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }, [ideas, clusters]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: "transparent" }}
      />
      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 400) - 240),
            top: tooltip.y - 10,
          }}
        >
          <div className="font-medium text-white mb-1">{tooltip.idea.text}</div>
          {tooltip.cluster && (
            <div style={{ color: tooltip.cluster.color, fontSize: "11px" }}>
              {tooltip.cluster.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
