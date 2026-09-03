import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "zh";

const DICT: Record<string, { en: string; zh: string }> = {
  "brand.tagline": { en: "One deck for every agent", zh: "一张牌桌，统御所有 agent" },
  "nav.deck": { en: "deck", zh: "甲板" },
  "nav.mcp": { en: "mcp", zh: "MCP" },
  "nav.skills": { en: "skills", zh: "技能" },
  "nav.agents": { en: "agents", zh: "代理" },
  "nav.logs": { en: "logs", zh: "日志" },
  "nav.vault": { en: "vault", zh: "保险库" },
  "nav.design": { en: "design", zh: "设计" },
  "common.refresh": { en: "refresh", zh: "刷新" },
  "common.loading": { en: "loading deck…", zh: "加载中…" },
  "mcp.discover": { en: "discover from agent configs", zh: "从代理配置发现" },
  "mcp.scanning": { en: "scanning…", zh: "扫描中…" },
  "mcp.importSelected": { en: "import selected", zh: "导入选中" },
  "mcp.adoptAll": { en: "adopt all", zh: "一键收编" },
  "mcp.importing": { en: "importing…", zh: "导入中…" },
  "mcp.syncWarn": {
    en: "Sync pushes the ToonDeck toolset into ALL detected agents (overwrites their MCP config lists). Continue?",
    zh: "同步会把 ToonDeck 工具集写入所有已检测到的 agent（覆盖其 MCP 配置清单）。继续？",
  },
  "agents.launch": { en: "launch", zh: "启动" },
  "agents.stop": { en: "stop", zh: "停止" },
  "agents.logs": { en: "logs", zh: "日志" },
  "agents.hideLogs": { en: "hide logs", zh: "收起日志" },
  "agents.model": { en: "model…", zh: "模型…" },
  "agents.notInstalled": { en: "not installed", zh: "未安装" },
  "agents.notLaunched": { en: "not launched", zh: "未启动" },
  "agents.running": { en: "running", zh: "运行中" },
  "agents.exited": { en: "exited", zh: "已退出" },
  "agents.windowLaunched": { en: "window opened on your desktop", zh: "已在桌面打开终端窗口" },
  "agents.downloadLog": { en: "download log report (agent-ready)", zh: "下载日志报告（可直接丢给 agent 分析修复）" },
  "mcp.tools": { en: "tool inventory", zh: "工具清单" },
  "mcp.browse": { en: "browse tools", zh: "浏览工具" },
  "agents.discover": { en: "discover agents", zh: "发现 agent" },
  "agents.adopt": { en: "adopt", zh: "收养" },
  "agents.adopted": { en: "adopted", zh: "已收养" },
  "agents.probe": { en: "probe", zh: "试探" },
  "agents.launchCmd": { en: "launch command…", zh: "启动命令…" },
  "agents.addLaunchCmd": { en: "add launch command", zh: "添加启动命令" },
  "agents.saveCmd": { en: "save", zh: "保存" },
  "agents.vaultLink": { en: "manage & test in Vault →", zh: "在 Vault 页管理/测试 →" },
  "vault.relation": {
    en: "Agents-page provider catalog = quick enable; this Vault = full management (store keys / probe / delete).",
    zh: "Agents 页的提供商目录=快捷启用；本保险库=全量管理（存密钥 / 测试 / 删除）。",
  },
  "agents.noUnknown": { en: "no unknown agents — all known ✓", zh: "无陌生 agent——全部在册 ✓" },
  "status.engine": { en: "engine", zh: "引擎" },
  "status.offline": { en: "offline", zh: "离线" },
  // UX-C1: fleet dashboard + panel chrome
  "fleet.overview": { en: "🚀 mcptoon fleet overview", zh: "🚀 mcptoon 舰队总览" },
  "fleet.capabilities": { en: "capabilities, all managed by mcptoon", zh: "个能力，全部由 mcptoon 统一管理" },
  "fleet.probing": { en: "probing everything…", zh: "全量实探中…" },
  "fleet.summary": {
    en: "{tools} MCP tools + {skills} skills + {agents} CLI agents",
    zh: "{tools} MCP 工具 + {skills} 技能 + {agents} CLI agents",
  },
  "fleet.mcpTools": { en: "MCP tools (live-probed)", zh: "MCP 工具（全量实探）" },
  "fleet.adoptedSub": { en: "{a} adopted · {d} found ready to adopt", zh: "{a} 已接管 · {d} 发现待收编" },
  "fleet.firstScan": { en: "first full scan takes ~10-30s", zh: "首次全量扫描约 10-30 秒" },
  "fleet.skills": { en: "skills (gbrain/jiyi & more)", zh: "技能（含 gbrain/jiyi 等）" },
  "fleet.skillsSub": { en: "{total} in total · views {ok}/{views} healthy", zh: "{total} 总数 · 视图 {ok}/{views} 健康" },
  "fleet.launchable": { en: "{n} launchable in one click", zh: "{n} 个可一键启动" },
  "fleet.bySource": { en: "tool sources:", zh: "工具来源：" },
  "fleet.tools": { en: "tools", zh: "工具" },
  "fleet.sourcesScanned": { en: "sources ({n} config sources scanned):", zh: "来源（{n} 个配置源已扫）：" },
  "fleet.sot": { en: "single source of truth: {path}", zh: "单一真源: {path}" },
  // UX-C2: three-state component
  "state.unreachable": { en: "engine unreachable — check the service and retry", zh: "引擎无响应——请检查服务后重试" },
  "state.retry": { en: "retry", zh: "重试" },
  // UX-C1: McpPanel chrome
  "mcp.takeoverSources": { en: "takeover sources:", zh: "接管来源:" },
  "mcp.managedTools": { en: "{n} tools under management", zh: "共接管 {n} 个工具" },
  "mcp.healthFailed": {
    en: "health check failed — 体检失败（超时或引擎无响应，35s 上限），可直接重试",
    zh: "体检失败（超时或引擎无响应，35s 上限），可直接重试 — health check failed",
  },
  // UX-C1 part 2: agents provider catalog + custom source + TUI explainer
  "agents.providers": { en: "🔌 model providers ({ok}/{n} enabled)", zh: "🔌 模型提供商（{ok}/{n} 已启用）" },
  "agents.modelsCount": { en: "({n} models)", zh: "({n} 模型)" },
  "agents.enabled": { en: "✓ enabled", zh: "✓ 已启用" },
  "agents.disable": { en: "disable", zh: "停用" },
  "agents.enableKeyless": { en: "enable (local, keyless)", zh: "一键启用（本地免 Key）" },
  "agents.enable": { en: "enable", zh: "启用" },
  "agents.cancel": { en: "cancel", zh: "取消" },
  "agents.keyPlaceholder": { en: "API key (goes to OS keychain)", zh: "API Key（进系统钥匙串）" },
  "agents.customSource": { en: "＋ custom source (any OpenAI-compatible gateway)", zh: "＋ 自定义源（任意 OpenAI 兼容网关）" },
  "agents.profileName": { en: "name (e.g. my-proxy)", zh: "名称 (如 my-proxy)" },
  "agents.baseUrl": { en: "base URL (https://…/v1)", zh: "Base URL (https://…/v1)" },
  "agents.save": { en: "save", zh: "保存" },
  "agents.sourceTitle": { en: "API model source", zh: "API 模型源" },
  "agents.defaultApi": { en: "default API", zh: "默认 API" },
  "agents.windowLog": {
    en: "🪟 logs stream in their own desktop window — the ring only records pipe launches.",
    zh: "🪟 日志在桌面窗口内运行 — 下方的环形记录仅捕获管道启动。",
  },
  // logs panel
  "logs.subtitle": { en: "live logs · download an md report to hand any agent for self-repair", zh: "实时日志 · 下载 md 报告直接丢给任意 agent 自修" },
  "logs.running": { en: "running · pid {pid}", zh: "运行中 · pid {pid}" },
  "logs.exited": { en: "exited · code {code}", zh: "已退出 · code {code}" },
  "logs.downloadMd": { en: "⬇ md report", zh: "⬇ 下载 md 报告" },
  "logs.collapse": { en: "collapse", zh: "收起" },
  "logs.live": { en: "live log", zh: "实时日志" },
  "logs.never": {
    en: "never-launched agents: {names} — one-click launch them on the Agents page and their logs appear here.",
    zh: "未启动过的 agent：{names} — 去 Agents 页一键启动后，日志会出现在这里。",
  },
  "logs.empty": {
    en: "no logs yet — launch an agent (Agents page) or run an MCP health check first.",
    zh: "还没有任何日志 — 启动一个 agent（Agents 页）或跑一次 MCP 体检后再来。",
  },
  // skills pills
  "skills.searchPlaceholder": { en: "🔍 search skill names or descriptions…", zh: "🔍 搜索技能名或描述…" },
  "skills.all": { en: "📚 all {n}", zh: "📚 全部 {n}" },
  "skills.noMatch": { en: "no matching skills — try another category or search term.", zh: "没有匹配的技能 — 换个分类或搜索词。" },
  // UX-D1: console onboarding
  "onboard.step1": { en: "step 1 — wire up your MCP fleet", zh: "第 1 步 —— 接管你的 MCP 舰队" },
  "onboard.step1Body": {
    en: "No MCP servers are under management yet. Open the MCP page to discover servers from your agent configs and adopt them in one click.",
    zh: "还没有任何 MCP server 被接管。去 MCP 页从各 agent 配置里发现 server，一键收编。",
  },
  "onboard.step2": { en: "next step — put an agent on the deck", zh: "下一步 —— 把 agent 拉上牌桌" },
  "onboard.step2Body": {
    en: "{servers} MCP servers and {tools} tools are under management. Launch a CLI agent from the Agents page and its logs stream right here.",
    zh: "已有 {servers} 个 MCP server、{tools} 个工具被接管。去 Agents 页一键启动 CLI agent，日志会实时出现在这里。",
  },
  "onboard.goMcp": { en: "discover on the MCP page →", zh: "去 MCP 页发现收编 →" },
  "onboard.goAgents": { en: "launch on the Agents page →", zh: "去 Agents 页启动 →" },
};

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("toondeck.lang");
    return saved === "zh" || saved === "en" ? saved : "en";
  });
  const t = (k: string, vars?: Record<string, string | number>) => {
    let s: string = DICT[k]?.[lang] ?? k;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        s = s.replaceAll(`{${name}}`, String(value));
      }
    }
    return s;
  };
  const wrap = (l: Lang) => {
    localStorage.setItem("toondeck.lang", l);
    setLang(l);
  };
  return <Ctx.Provider value={{ lang, setLang: wrap, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
