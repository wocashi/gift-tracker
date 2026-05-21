import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface NewsArticle {
  title: string;
  url: string;
  source?: string;
  /** 衛星の配置角度 0〜360°。似た記事は近い角度、異なる記事は遠い角度 */
  angle?: number;
  /** トピックとの関連度 0.0〜1.0。高いほど中心に近い軌道に配置される */
  relevance?: number;
}

export async function POST(request: NextRequest) {
  const { label, summary, ideas, memo } = await request.json();

  // 検索クエリを組み立て
  const query = memo?.trim()
    ? memo.trim().slice(0, 200)
    : [label, summary, ...((ideas as string[]) ?? []).slice(0, 2)]
        .filter(Boolean).join(" ").slice(0, 200);

  try {
    // ① Tavily で記事を検索（無料・多様なソース・Google以外も含む）
    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
        exclude_domains: ["google.com", "google.co.jp"],
      }),
    });

    if (!tavilyRes.ok) throw new Error(`Tavily error: ${tavilyRes.status}`);

    const tavilyData = await tavilyRes.json();
    const rawArticles = ((tavilyData.results ?? []) as {
      title?: string; url: string; content?: string; score?: number;
    }[]).slice(0, 5).map(r => ({
      title: r.title ?? r.url,
      url: r.url,
      source: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return undefined; } })(),
      tavilyScore: r.score ?? 0.5,
      snippet: (r.content ?? "").slice(0, 80),
    }));

    if (rawArticles.length === 0) throw new Error("検索結果が0件でした");

    // ② Claude Haiku で angle + relevance だけ割り当て（最小トークン）
    const articleList = rawArticles
      .map((a, i) => `${i + 1}. ${a.title}${a.snippet ? ` — ${a.snippet}` : ""}`)
      .join("\n");

    const haikuRes = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 250,
      messages: [{
        role: "user",
        content: `トピック「${label}」の記事5件にangle(0〜360)とrelevance(0.0〜1.0)を割り当てて。

${articleList}

ルール:
- 内容が似た記事→angleを近く(差30°以内)、異なる記事→遠く(差60°以上)
- relevance: 核心=0.9〜1.0 直接関連=0.6〜0.8 間接=0.3〜0.5

JSON配列のみ返答:
[{"i":0,"angle":45,"relevance":0.85},...]`,
      }],
    });

    const haikuText = haikuRes.content[0].type === "text" ? haikuRes.content[0].text : "";
    const jsonMatch = haikuText.match(/\[[\s\S]*\]/);

    const angleMap: Record<number, { angle: number; relevance: number }> = {};
    if (jsonMatch) {
      try {
        const parsed: { i: number; angle: number; relevance: number }[] = JSON.parse(jsonMatch[0]);
        parsed.forEach(item => { angleMap[item.i] = { angle: item.angle, relevance: item.relevance }; });
      } catch { /* フォールバックに任せる */ }
    }

    const articles: NewsArticle[] = rawArticles.map((a, i) => ({
      title: a.title,
      url: a.url,
      source: a.source,
      angle: angleMap[i]?.angle ?? (i / rawArticles.length) * 360,
      relevance: angleMap[i]?.relevance ?? a.tavilyScore,
    }));

    return NextResponse.json({ articles });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
