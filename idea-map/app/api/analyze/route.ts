import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const { ideas } = await request.json() as { ideas: { id: string; text: string }[] };

  if (!ideas || ideas.length < 2) {
    return NextResponse.json({ error: "アイデアは2件以上必要です" }, { status: 400 });
  }

  const ideaList = ideas.map((idea, i) => `${i + 1}. [${idea.id}] ${idea.text}`).join("\n");

  // 固定の指示部分（キャッシュ対象）
  const systemPrompt = `あなたは意味マッピングの専門家です。ユーザーが送るアイデア一覧を分析し、クラスター間の関係性まで考慮した2D意味マップを作成してください。

【思考ステップ】
STEP 1: アイデアをテーマでグループ分けし、2〜6個のクラスターを決める
STEP 2: クラスター同士の関係性を分析する
  - 強く関連するクラスター（共通概念・依存関係・補完関係）→ 地図上で近くに配置
  - 無関係なクラスター → 地図上で遠ざける
  - 関連の強さ: 高=15単位以内、中=20〜35単位、低/無=40単位以上
STEP 3: クラスター中心座標を先に決めてから、各アイデアをその周辺に配置する
  - クラスター内のアイデアは中心から10〜20単位以内に散らす（重ねない）
  - 地図全体（0〜100）を広く使う

【座標ルール】
- クラスター間距離: 関連あり=15〜35、関連なし=40〜70
- アイデア重複禁止: 同座標に2つのアイデアを置かない
- 端に寄りすぎない: x,y とも 8〜92 の範囲

以下のJSON形式のみで返答してください（説明・コメント不要）:
{
  "ideas": [
    {"id": "アイデアのid", "x": 45.2, "y": 67.8, "clusterId": "c1"}
  ],
  "clusters": [
    {"id": "c1", "label": "クラスター名", "summary": "1〜2文の日本語要約", "color": "#16a34a"}
  ]
}
クラスター色は鮮明で互いに区別しやすいHEXカラーにしてください。`;

  // アイデア数に応じてmax_tokensを動的調整（アイデア1件あたり約80トークン + クラスター分の余裕）
  const dynamicMaxTokens = Math.min(ideas.length * 80 + 1000, 4096);

  let message;
  try {
    message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: dynamicMaxTokens,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }] as any,
      messages: [{
        role: "user",
        content: `アイデア一覧:\n${ideaList}\n\n使用するアイデアID: ${ideas.map(i => `"${i.id}"`).join(", ")}`,
      }],
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
