import themeJson from "@/config/theme.json";

// config/theme.json をそのまま公開する。色は16進文字列なので hex() で数値へ変換して使う。
export const theme = themeJson;

// "#rrggbb" → 0xrrggbb (THREE.js のマテリアル色用)
export function hex(color: string): number {
  return parseInt(color.replace("#", ""), 16);
}
