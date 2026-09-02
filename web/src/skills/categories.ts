/** 技能自动分类规则 — SkillsPanel 与 CategoryPills 共用。 */
export const CATEGORY_RULES: Record<string, string> = {
  "🎬 视频与音频": "video|comfy|remotion|hyperframes|seedance|剪映|视频|tts|asr|语音|播客|口播|字幕|song|music",
  "🔍 搜索与情报": "search|搜索|exa|wigolo|crawl|抓取|爬虫|reddit|twitter|热榜|trend|last30|research|omni|kb",
  "📥 下载": "download|下载|网盘|xiazai|kuake|quark|aria2|baidu|xunlei|netdisk",
  "🧠 记忆与会话": "gbrain|记忆|memory|zhangben|jiyi|mempalace|账本|handoff|huihua|会话|session|index",
  "🛠 开发工程": "git|github|gh-|code|dev|python|powershell|testing|security|docker|tauri|insforge|skill|规范|review|tdd|archify|tupu|config|debug|error",
  "🌐 网络与基础设施": "clash|vps|ssh|网络|代理|lunxun|streamguard|surfshark|隧道|dual-machine|cf|cdn|yuming|域名",
  "📣 内容与增长": "推广|tuiguang|blog|博主|发帖|shejiao|mail|邮箱|mailbot|x-ai|blogger|内容|ribao|xiewen|写文|humanizer|写作",
  "🔌 平台与工具": "mcp|toondeck|api|key|llm|模型|model|apikey|rotate|dsh|agent|窗口|term|定时|automat|windows|scan|zclean|qingli|password|kami|-pdf|doc",
  "🎨 设计与图像": "设计|design|图|svg|海报|card|figma|图像|vision|ocr|截图|logo|icon|gpt-image",
};

export const OTHER = "📦 其他";

export type SkillLike = {
  dirname: string;
  name: string | null;
  description: string | null;
  valid: boolean;
};

export function categoryOf(s: SkillLike): string {
  const hay = `${s.dirname} ${s.description ?? ""}`;
  for (const [label, words] of Object.entries(CATEGORY_RULES)) {
    if (new RegExp(words, "i").test(hay)) return label;
  }
  return OTHER;
}
