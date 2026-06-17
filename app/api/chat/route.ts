import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { CHARACTERS, getCharacterById } from "@/lib/characters";

const MODEL = process.env.ANTHROPIC_CHAT_MODEL || "claude-opus-4-8";
const CHARACTER_IDS = CHARACTERS.map((c) => c.id);

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    replies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          characterId: { type: "string", enum: CHARACTER_IDS },
          text: { type: "string" },
        },
        required: ["characterId", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["replies"],
  additionalProperties: false,
};

function buildSystemPrompt(): string {
  const roster = CHARACTERS.map(
    (c) =>
      `- id: ${c.id} / 名前: ${c.name} / 部署: ${c.department} / 口調: ${
        c.tone === "polite" ? "敬語" : "タメ口"
      } / 性格: ${c.persona}`
  ).join("\n");

  return `あなたは3Dブラウザゲーム「sanacode Lab Messenger」に登場する複数の社内キャラクターのセリフを生成するアシスタントです。
プレイヤー(配達員)が球体惑星上の各部署を訪ね、チャットで話しかけます。

登場キャラクター一覧:
${roster}

ルール:
- ユーザーの発言(user_message)に対して、present_character_idsに含まれるキャラクターそれぞれが一言だけ返答する。
- 各キャラクターの口調・性格を厳守すること。タメ口のキャラは敬語を使わない。敬語のキャラはタメ口を使わない。
- 各セリフは日本語で1文、20〜40文字程度の短い返答にする。説明的になりすぎないこと。
- present_character_idsにないキャラクターについては返答を生成しない。
- 出力は指定されたJSONスキーマに厳密に従うこと。`;
}

function fallbackReplies(characterIds: string[]) {
  return characterIds.map((id) => {
    const c = getCharacterById(id);
    const text = c?.tone === "polite" ? "申し訳ありません、今うまく繋がらないようです。" : "あー、今ちょっと繋がらないわ。";
    return { characterId: id, text };
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ replies: [] }, { status: 400 });
  }

  const { message: rawMessage, characterIds: rawIds } = body as {
    message?: unknown;
    characterIds?: unknown;
  };

  const message = typeof rawMessage === "string" ? rawMessage.slice(0, 500) : "";
  const characterIds = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === "string" && CHARACTER_IDS.includes(id))
    : [];

  if (!message || characterIds.length === 0) {
    return NextResponse.json({ replies: [] });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ replies: fallbackReplies(characterIds) });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: REPLY_SCHEMA },
      },
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `present_character_ids: ${JSON.stringify(characterIds)}\nuser_message: ${message}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ replies: fallbackReplies(characterIds) });
    }

    const parsed = JSON.parse(textBlock.text) as { replies?: { characterId: string; text: string }[] };
    return NextResponse.json({ replies: parsed.replies ?? fallbackReplies(characterIds) });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error.status, error.message);
    } else {
      console.error("Chat route error", error);
    }
    return NextResponse.json({ replies: fallbackReplies(characterIds) });
  }
}
