import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface NewsArticle {
  title: string;
  url: string;
  source?: string;
}

export async function POST(request: NextRequest) {
  const { label, summary, ideas } = await request.json();

  try {
    // Claude の組み込みウェブ検索ツールで実際のサイトを検索
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.messages.create as any)({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      }],
      messages: [{
        role: "user",
        content: `「${label}」に関連するウェブサイトを検索して5件見つけてください。
テーマ概要: ${summary || label}
関連キーワード: ${(ideas as string[]).slice(0, 5).join("、")}

ニュース記事・公式サイト・企業HP・Note記事・ブログなど様々なタイプを含めてください。
見つかったサイトを以下のJSON形式のみで返してください（前置き・説明不要）:
{"articles": [{"title": "ページタイトル", "url": "https://...", "source": "サイト名"}, ...]}`,
      }],
    });

    // Claudeのテキスト応答からJSONを抽出
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlock = response.content.find((b: any) => b.type === "text");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text: string = (textBlock as any)?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const { articles } = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ articles: (articles as NewsArticle[]).slice(0, 5) });
    }

    // JSONが取れない場合、web_search_tool_result ブロックから直接URL抽出
    const articles: NewsArticle[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const block of response.content as any[]) {
      if (block.type === "web_search_tool_result") {
        for (const item of block.content ?? []) {
          if (item.type === "document" && item.document?.url) {
            articles.push({
              title: item.document.title ?? item.document.url,
              url: item.document.url,
              source: (() => {
                try { return new URL(item.document.url).hostname.replace("www.", ""); } catch { return undefined; }
              })(),
            });
          }
        }
      }
    }

    if (articles.length > 0) {
      return NextResponse.json({ articles: articles.slice(0, 5) });
    }

    throw new Error("検索結果を取得できませんでした");
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
