import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface NewsArticle {
  title: string;
  url: string;
}

export async function POST(request: NextRequest) {
  const { label, summary, ideas } = await request.json();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `テーマ「${label}」に関連する最新ニュースを探すための日本語検索キーワードを5つ提案してください。
テーマの概要: ${summary || "なし"}
関連アイデア: ${(ideas as string[]).slice(0, 5).join("、")}

各キーワードは10文字以内の短いものにしてください。
JSON形式のみ返してください:
{"queries": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"]}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON not found");
    const { queries } = JSON.parse(match[0]);

    // 各クエリをGoogleニュース検索URLと組み合わせてarticlesとして返す
    const articles: NewsArticle[] = (queries as string[]).map((q: string) => ({
      title: q,
      url: `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`,
    }));

    return NextResponse.json({ articles });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
