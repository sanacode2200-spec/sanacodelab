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

export const CHARACTERS: CharacterData[] = [
  {
    id: "aoi",
    name: "アオイ",
    department: "開発部",
    color: "#4488ff",
    colorHex: 0x4488ff,
    tone: "casual",
    deliverLine: "受け取った。実装する。",
    persona:
      "エンジニア気質。物事を技術的・合理的に捉え、口数は少なくぶっきらぼうだが頼りになる。",
  },
  {
    id: "koyuki",
    name: "コユキ",
    department: "品質保証部",
    color: "#ff88cc",
    colorHex: 0xff88cc,
    tone: "polite",
    deliverLine: "確認します。品質は妥協しません。",
    persona:
      "品質に厳格で慎重。物事を丁寧に確認してから話す。礼儀正しいが芯はしっかりしている。",
  },
  {
    id: "take",
    name: "タケ",
    department: "商品企画部",
    color: "#ffaa22",
    colorHex: 0xffaa22,
    tone: "casual",
    deliverLine: "了解。数字に落とす。",
    persona:
      "データと数字で物事を考える現実主義者。テンポよく、要点だけ短く話す。",
  },
  {
    id: "tsumugi",
    name: "ツムギ",
    department: "編集部",
    color: "#88ffaa",
    colorHex: 0x88ffaa,
    tone: "polite",
    deliverLine: "ありがとうございます。丁寧に仕上げます。",
    persona:
      "言葉や文章への気配りが細やかで丁寧。落ち着いた敬語で、相手を気遣う物言いをする。",
  },
  {
    id: "haru",
    name: "ハル",
    department: "マーケティング部",
    color: "#ff6644",
    colorHex: 0xff6644,
    tone: "casual",
    deliverLine: "やった!すぐ動く!",
    persona: "元気でテンションが高い。ノリがよく、すぐリアクションする。",
  },
  {
    id: "fuji",
    name: "フジ",
    department: "デザイン部",
    color: "#cc88ff",
    colorHex: 0xcc88ff,
    tone: "casual",
    deliverLine: "受け取った。ビジュアルに落とす。",
    persona:
      "ビジュアル思考でクリエイティブ。感覚的な言葉選びをし、見た目やイメージの話が好き。",
  },
  {
    id: "tsukasa",
    name: "ツカサ",
    department: "リサーチ部",
    color: "#44ffee",
    colorHex: 0x44ffee,
    tone: "casual",
    deliverLine: "了解。裏取りする。",
    persona:
      "慎重で分析的。物事を決めつけず、裏取りや根拠を重視する話し方をする。",
  },
];

export function findCharacterByQuery(query: string): CharacterData | undefined {
  const q = query.trim();
  if (!q) return undefined;
  return CHARACTERS.find((c) => q.includes(c.name));
}

export function getCharacterById(id: string): CharacterData | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
