import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const { ideas } = await request.json() as { ideas: { id: string; text: string }[] };

  if (!ideas || ideas.length < 2) {
    return NextResponse.json({ error: "アイデアは2件以上必要です" }, { status: 400 });
  }

  const ideaList = ideas.map((idea, i) => `${i + 1}. ${idea.text}`).join("\n");

  const prompt = `あなたは意味解析の専門家です。以下のアイデアリストを分析してください。

アイデア:
${ideaList}

タスク:
1. 意味的に近いアイデア同士が近くなるよう、各アイデアに2D座標(x: 0〜100, y: 0〜100)を割り当てる
2. 自然なクラスターを見つけ、意味のあるラベルをつける
3. 各クラスターの要約を日本語で作成する

座標の指針:
- 似たテーマのアイデアは15単位以内に配置
- 異なるテーマは30単位以上離す
- クラスター内でアイデアを適度に広げる（重ねない）
- 0〜100の範囲を最大限に使う

以下のJSON形式のみで返答してください（説明文は不要）:
{
  "ideas": [
    {"id": "アイデアのid", "x": 45.2, "y": 67.8, "clusterId": "c1"},
    ...
  ],
  "clusters": [
    {"id": "c1", "label": "クラスター名", "summary": "1〜2文の要約", "color": "#16a34a"},
    ...
  ]
}

利用するアイデアID: ${ideas.map(i => `"${i.id}"`).join(", ")}
クラスター数は2〜6個、色は鮮明で区別しやすいHEXカラーを使用してください。`;

  let message;
  try {
    message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Claude APIエラー: ${msg}` }, { status: 500 });
  }

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AIの応答を解析できませんでした" }, { status: 500 });
  }

  try {
    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "JSONの解析に失敗しました" }, { status: 500 });
  }
}
