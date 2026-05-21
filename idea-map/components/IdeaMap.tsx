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
  /** 衛星の配置角度 0〜360°。似た記事は近い角度、異なる記事は遠い角度 */
  angle?: number;
  /** トピックとの関連度 0.0〜1.0。高いほど中心に近い軌道に配置される */
  relevance?: number;
}

interface IdeaMapProps {
  ideas: PositionedIdea[];
  clusters: Cluster[];
  /** ideaId → アイデアに紐づく衛星ニュース（小軌道）*/
  ideaNewsMap?: Record<string, NewsArticle[]>;
  /** clusterId → クラスターに紐づく衛星ニュース（大軌道）*/
  clusterNewsMap?: Record<string, NewsArticle[]>;
  onIdeaClick?: (idea: PositionedIdea, cluster: Cluster | null) => void;
  onNewsClick?: (article: NewsArticle, screenX: number, screenY: number) => void;
}

/**
 * URLのハッシュ値から 0.0〜1.0 の擬似乱数を生成する
 * relevance が未定義の古いデータでも距離がばらつくようにするフォールバック
 */
function urlHashFraction(url: string): number {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

/** relevance を取得。未定義の場合は URL ハッシュでばらつかせる */
function getRelevance(article: NewsArticle): number {
  return article.relevance ?? urlHashFraction(article.url ?? article.title ?? "");
}

interface SatNode extends d3.SimulationNodeDatum {
  targetRadius: number;
  baseAngle: number;
  rel: number;
}

/**
 * D3 フォースシミュレーションで衛星の最終 2D 座標を計算する。
 * - 似た角度（< 50°差）の記事同士はリンク力で引き合う → 物理的に近くなる
 * - 全記事は電荷力で互いに反発 → 重なりを防ぐ
 * - ラジアル力がそれぞれの relevance 半径に戻す → 関連度の距離感を維持
 */
function runSatForce(
  articles: NewsArticle[],
  cx: number, cy: number,
  getRadius: (a: NewsArticle, i: number) => number,
  getAngle:  (a: NewsArticle, i: number) => number,
): Array<{ x: number; y: number; rel: number; angle: number }> {
  const nodes: SatNode[] = articles.map((article, i) => {
    const r = getRadius(article, i);
    const a = getAngle(article, i);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
             targetRadius: r, baseAngle: a, rel: getRelevance(article) };
  });

  // 角度差 < 50° の記事ペアにリンクを張る（類似 = 引き合う）
  const THRESHOLD = 50 * (Math.PI / 180);
  const links: Array<{ source: number; target: number; sim: number }> = [];
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      let diff = Math.abs(nodes[a].baseAngle - nodes[b].baseAngle);
      diff = Math.min(diff, 2 * Math.PI - diff);
      if (diff < THRESHOLD) {
        links.push({ source: a, target: b, sim: 1 - diff / THRESHOLD });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = d3.forceSimulation<SatNode>(nodes)
    .force("link",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d3.forceLink(links) as any)
        .distance((l: { sim: number }) => 22 + (1 - l.sim) * 85) // 類似→22px近く・非類似→最大107px
        .strength((l: { sim: number }) => l.sim * 0.9)
    )
    .force("charge", d3.forceManyBody<SatNode>().strength(-40)) // 反発で重なり防止
    .force("radial",
      d3.forceRadial<SatNode>(d => d.targetRadius, cx, cy).strength(0.55) // 元の半径に戻す
    )
    .stop();

  sim.tick(150); // 同期実行

  return nodes.map(n => ({ x: n.x!, y: n.y!, rel: n.rel, angle: n.baseAngle }));
}

export default function IdeaMap({ ideas, clusters, ideaNewsMap = {}, clusterNewsMap = {}, onIdeaClick, onNewsClick }: IdeaMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onIdeaClickRef = useRef(onIdeaClick);
  onIdeaClickRef.current = onIdeaClick;
  const onNewsClickRef = useRef(onNewsClick);
  onNewsClickRef.current = onNewsClick;

  const scalesRef = useRef<{
    xScale: d3.ScaleLinear<number, number>;
    yScale: d3.ScaleLinear<number, number>;
  } | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  // ズーム位置を跨いで保持する（再描画でリセットされないように）
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

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
      .on("zoom", (ev) => {
        g.attr("transform", ev.transform);
        zoomTransformRef.current = ev.transform; // ズーム位置を保存
        setTooltip(null);
      });
    svg.call(zoom);
    // 前回のズーム位置を復元（再描画後もズームが維持される）
    if (zoomTransformRef.current !== d3.zoomIdentity) {
      svg.call(zoom.transform, zoomTransformRef.current);
    }

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

      // フォースシミュレーション用の半径・角度計算関数
      const getRadius = (article: NewsArticle, i: number) => {
        const baseOrbit = i >= innerCount ? OUTER : INNER;
        const rel = getRelevance(article);
        return baseOrbit * (0.45 + (1 - rel) * 1.1);
      };
      const getAngle = (_article: NewsArticle, i: number) => {
        const isOuter = i >= innerCount;
        const ringCount = isOuter ? articles.length - innerCount : innerCount;
        const ringIndex = isOuter ? i - innerCount : i;
        return _article.angle != null
          ? _article.angle * Math.PI / 180
          : (ringIndex / ringCount) * 2 * Math.PI - Math.PI / 2
              + (isOuter ? Math.PI / ringCount : 0);
      };

      // フォースで最終位置を計算（類似記事は引き合い、異なる記事は反発）
      const positions = runSatForce(articles, cx, cy, getRadius, getAngle);

      articles.forEach((article, i) => {
        const { x: nx, y: ny, rel } = positions[i];
        // ラベルの向きは最終位置→中心の方向から算出
        const labelAngle = Math.atan2(ny - cy, nx - cx);
        const distFromCenter = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);

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

        // 衛星ドット（白丸＋色枠）rel=1.0→r13、rel=0.0→r7
        const dotR = Math.round(7 + rel * 6);
        const dot = sg.append("circle")
          .attr("cx", nx).attr("cy", ny).attr("r", 0)
          .attr("fill", "white")
          .attr("stroke", color).attr("stroke-width", 1.8)
          .attr("opacity", 0.9);

        dot.transition().duration(400).delay(i * 80 + 100).attr("r", dotR);

        // 📰 アイコン
        const icon = sg.append("text")
          .attr("x", nx).attr("y", ny + 1)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("font-size", "10px").attr("opacity", 0)
          .attr("pointer-events", "none")
          .text("📰");

        icon.transition().duration(300).delay(i * 80 + 250).attr("opacity", 1);

        // ラベル（ドットの外側・最終位置の方向に配置）
        const shortLabel = article.title.length > 13 ? article.title.slice(0, 13) + "…" : article.title;
        const lx = cx + Math.cos(labelAngle) * (distFromCenter + 17);
        const ly = cy + Math.sin(labelAngle) * (distFromCenter + 17);
        const anchor = Math.cos(labelAngle) > 0.25 ? "start" : Math.cos(labelAngle) < -0.25 ? "end" : "middle";

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
            dot.interrupt().attr("stroke-width", 2.8).attr("r", dotR + 3);
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
            dot.attr("stroke-width", 1.8).attr("r", dotR);
            setTooltip(null);
          })
          .on("click", (event: MouseEvent) => {
            const rect = containerRef.current!.getBoundingClientRect();
            onNewsClickRef.current?.(article, event.clientX - rect.left, event.clientY - rect.top);
          });
      });
    });

  // ideaNewsMapが変わったとき（保存時）に再描画。ideas/clustersが変わったときも再描画。
  }, [ideaNewsMap, ideas, clusters]);

  // ── クラスター衛星ドット（大軌道・🌐アイコン）─────────
  useEffect(() => {
    const g = gRef.current;
    const scales = scalesRef.current;
    if (!g || !scales) return;

    g.selectAll(".cluster-satellite-root").remove();

    const clusterGroups = d3.group(ideas, d => d.clusterId);

    // クラスター間接続線描画用：全衛星の位置を収集
    const allClusterSats: { clusterId: string; color: string; nx: number; ny: number }[] = [];

    Object.entries(clusterNewsMap).forEach(([clusterId, articles]) => {
      if (!articles?.length) return;

      const cluster = clusters.find(c => c.id === clusterId);
      if (!cluster) return;

      const cIdeas = clusterGroups.get(clusterId) ?? [];
      const pts = cIdeas.map(d => [scales.xScale(d.x), scales.yScale(d.y)] as [number, number]);
      const cx = d3.mean(pts, p => p[0]) ?? 0;
      const cy = d3.mean(pts, p => p[1]) ?? 0;
      const maxDist = Math.max(...pts.map(p => Math.sqrt((p[0]-cx)**2 + (p[1]-cy)**2)), 40);
      const baseOrbit = maxDist + 85; // クラスターブロブの外側

      const clusterArticles = articles.slice(0, 5);

      // フォースシミュレーションで最終位置を計算
      const clusterPositions = runSatForce(
        clusterArticles, cx, cy,
        (article) => {
          const rel = getRelevance(article);
          return baseOrbit * (0.55 + (1 - rel) * 0.9);
        },
        (article, i) => article.angle != null
          ? article.angle * Math.PI / 180
          : (i / clusterArticles.length) * 2 * Math.PI - Math.PI / 2,
      );

      clusterArticles.forEach((article, i) => {
        const { x: nx, y: ny, rel } = clusterPositions[i];
        const labelAngle = Math.atan2(ny - cy, nx - cx);
        const distFromCenter = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);

        // 位置を収集（後でクラスター間接続線に使う）
        allClusterSats.push({ clusterId, color: cluster.color, nx, ny });

        const sg = g.append("g")
          .attr("class", "cluster-satellite-root")
          .style("cursor", "pointer");

        // 接続線（クラスター中心から）
        sg.append("line")
          .attr("x1", cx).attr("y1", cy)
          .attr("x2", nx).attr("y2", ny)
          .attr("stroke", cluster.color).attr("stroke-width", 0.6)
          .attr("stroke-dasharray", "2 6")
          .attr("opacity", 0).attr("pointer-events", "none")
          .transition().duration(600).delay(i * 100).attr("opacity", 0.25);

        // 衛星ドット（rel=1.0→r15、rel=0.0→r9）
        const dotR = Math.round(9 + rel * 6);
        const dot = sg.append("circle")
          .attr("cx", nx).attr("cy", ny).attr("r", 0)
          .attr("fill", cluster.color)
          .attr("opacity", 0.15)
          .attr("stroke", cluster.color).attr("stroke-width", 1.5)
          .attr("stroke-opacity", 0.7);

        dot.transition().duration(450).delay(i * 100 + 150).attr("r", dotR);

        // 🌐 アイコン
        const icon = sg.append("text")
          .attr("x", nx).attr("y", ny + 1)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("font-size", "11px").attr("opacity", 0)
          .attr("pointer-events", "none")
          .text("🌐");

        icon.transition().duration(300).delay(i * 100 + 280).attr("opacity", 1);

        // ラベル（最終位置の方向に配置）
        const shortLabel = article.title.length > 13 ? article.title.slice(0, 13) + "…" : article.title;
        const lx = cx + Math.cos(labelAngle) * (distFromCenter + 20);
        const ly = cy + Math.sin(labelAngle) * (distFromCenter + 20);
        const anchor = Math.cos(labelAngle) > 0.25 ? "start" : Math.cos(labelAngle) < -0.25 ? "end" : "middle";

        sg.append("text")
          .attr("x", lx).attr("y", ly)
          .attr("text-anchor", anchor).attr("dominant-baseline", "middle")
          .attr("font-size", "9px").attr("font-weight", "700")
          .attr("fill", cluster.color).attr("opacity", 0)
          .attr("pointer-events", "none")
          .style("font-family", "'Helvetica Neue', Arial, sans-serif")
          .text(shortLabel)
          .transition().duration(300).delay(i * 100 + 320).attr("opacity", 0.8);

        // ふわふわアニメーション
        const FLOAT_AMP = 4;
        const FLOAT_DUR = 2800 + i * 400;
        function floatCycle(dir: 1 | -1) {
          dot.transition().duration(FLOAT_DUR / 2).ease(d3.easeSinInOut)
            .attr("cy", ny + dir * FLOAT_AMP)
            .on("end", () => floatCycle(-dir as 1 | -1));
          icon.transition().duration(FLOAT_DUR / 2).ease(d3.easeSinInOut)
            .attr("y", ny + 1 + dir * FLOAT_AMP);
        }
        setTimeout(() => floatCycle(-1), i * 100 + 400 + i * 500);

        // ホバー & クリック
        sg.on("mouseover", (event) => {
            dot.interrupt().attr("r", dotR + 3).attr("opacity", 0.25).attr("stroke-width", 2.5);
            const rect = containerRef.current!.getBoundingClientRect();
            setTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              text: article.title,
              subText: `${cluster.label} ▸ クリックで開く`,
              color: cluster.color,
            });
          })
          .on("mouseout", () => {
            dot.attr("r", dotR).attr("opacity", 0.15).attr("stroke-width", 1.5);
            setTooltip(null);
          })
          .on("click", (event: MouseEvent) => {
            const rect = containerRef.current!.getBoundingClientRect();
            onNewsClickRef.current?.(article, event.clientX - rect.left, event.clientY - rect.top);
          });
      });
    });

    // ── クラスター間の衛星接続線（近い衛星同士を薄い線で繋ぐ）──────────────
    const CROSS_LINK_THRESHOLD = 140; // px以内なら接続
    for (let a = 0; a < allClusterSats.length; a++) {
      for (let b = a + 1; b < allClusterSats.length; b++) {
        const sa = allClusterSats[a];
        const sb = allClusterSats[b];
        if (sa.clusterId === sb.clusterId) continue; // 同クラスターはスキップ

        const dist = Math.sqrt((sa.nx - sb.nx) ** 2 + (sa.ny - sb.ny) ** 2);
        if (dist > CROSS_LINK_THRESHOLD) continue;

        // 距離が近いほど濃く（最大 opacity 0.22）
        const opacity = (1 - dist / CROSS_LINK_THRESHOLD) * 0.22;

        g.insert("line", ".cluster-satellite-root")
          .attr("class", "cluster-satellite-root cross-cluster-link")
          .attr("x1", sa.nx).attr("y1", sa.ny)
          .attr("x2", sb.nx).attr("y2", sb.ny)
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "4 5")
          .attr("opacity", 0)
          .attr("pointer-events", "none")
          .transition().duration(800).delay(400)
          .attr("opacity", opacity);
      }
    }

  }, [clusterNewsMap, ideas, clusters]);

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
