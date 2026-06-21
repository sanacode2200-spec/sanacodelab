import charactersJson from "@/config/characters.json";

export type CharacterTone = "casual" | "polite";

export interface CharacterData {
  id: string;
  name: string;
  department: string;
  color: string;
  colorHex: number;
  tone: CharacterTone;
  deliverLine: string;
  persona: string;
}

// キャラ定義は config/characters.json が単一ソース(ゲーム側の app/game/characters.ts と共通)。
// このモジュールはチャット/ペルソナ用に tone・persona の形へ変換して公開する。
export const CHARACTERS: CharacterData[] = charactersJson.roster.map((c) => ({
  id: c.id,
  name: c.name,
  department: c.department,
  color: c.color,
  colorHex: parseInt(c.color.replace("#", ""), 16),
  tone: c.speechStyle === "敬語" ? "polite" : "casual",
  deliverLine: c.line,
  persona: c.personality,
}));

export function findCharacterByQuery(query: string): CharacterData | undefined {
  const q = query.trim();
  if (!q) return undefined;
  return CHARACTERS.find((c) => q.includes(c.name));
}

export function getCharacterById(id: string): CharacterData | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
