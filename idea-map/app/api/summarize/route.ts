import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const { url } = await request.json();

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IdeaMap/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `以下のウェブページの内容を1〜2文の簡潔な日本語で要約してください。要約テキストのみ出力してください（前置き不要）。\n\n${text}`,
      }],
    });

    const summary = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
