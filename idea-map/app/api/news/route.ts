import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface NewsArticle {
  title: string;
  url: string;
  source?: string;
  /** 衛星の配置角度 0〜360°。似た記事は近い角度、異なる記事は遠い角度 */
  angle?: number;
}

export async function POST(request: NextRequest) {
  const { label, summary, ideas, memo } = await request.json();

  // 検索コンテキストを組み立て（メモがあれば優先的に使う）
  const context = [
    memo ? `メモ内容: ${memo}` : null,
    summary ? `クラスター概要: ${summary}` : null,
    ideas?.length ? `関連アイデア: ${(ideas as string[]).slice(0, 5).join("、")}` : null,
  ].filter(Boolean).join("\n");

  const searchInstruction = memo
    ? `以下のメモ内容に関連するウェブサイト・記事を検索して10件見つけてください。\nメモ: ${memo}`
    : `「${label}」に関連するウェブサイト・記事を検索して10件見つけてください。`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.messages.create as any)({
      model: "claude-opus-4-7",
      max_tokens: 3000,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      }],
      messages: [{
        role: "user",
        content: `${searchInstruction}
${context}

ニュース記事・公式サイト・企業HP・Note記事・ブログ・Wikipedia など幅広いタイプを含め、5件見つけてください。
見つかったサイトを以下のJSON形式のみで返してください（前置き・説明不要）:
{"articles": [{"title": "ページタイトル", "url": "https://...", "source": "サイト名", "angle": 45}, ...]}

角度(angle)の割り当てルール:
- 各記事に 0〜360 の角度を割り当てる
- 内容・テーマが似ている記事同士は近い角度（差が30度以内）にする
- 内容・テーマが異なる記事は遠い角度（差が60度以上）にする
- 記事全体が円周上に意味的に配置されるよう、まずテーマでグループ化してから各グループに角度帯を割り振ること`,
      }],
    });

    // テキスト応答からJSON抽出
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlock = response.content.find((b: any) => b.type === "text");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text: string = (textBlock as any)?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const { articles } = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ articles: (articles as NewsArticle[]).slice(0, 5) });
    }

    // フォールバック: tool_result ブロックからURL直接抽出
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
                try { return new URL(item.document.url).hostname.replace("www.", ""); }
                catch { return undefined; }
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
