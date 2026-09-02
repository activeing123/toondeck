import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "zh";

const DICT: Record<string, { en: string; zh: string }> = {
  "brand.tagline": { en: "One deck for every agent", zh: "一张牌桌，统御所有 agent" },
  "nav.deck": { en: "deck", zh: "甲板" },
  "nav.mcp": { en: "mcp", zh: "MCP" },
  "nav.skills": { en: "skills", zh: "技能" },
  "nav.agents": { en: "agents", zh: "代理" },
  "nav.vault": { en: "vault", zh: "保险库" },
  "nav.design": { en: "design", zh: "设计" },
  "common.refresh": { en: "refresh", zh: "刷新" },
  "common.loading": { en: "loading deck…", zh: "加载中…" },
  "mcp.health": { en: "run health check", zh: "健康体检" },
  "mcp.probing": { en: "probing…", zh: "探测中…" },
  "mcp.sync": { en: "sync all agents", zh: "同步全部代理" },
  "mcp.syncing": { en: "syncing…", zh: "同步中…" },
  "mcp.discover": { en: "discover from agent configs", zh: "从代理配置发现" },
  "mcp.scanning": { en: "scanning…", zh: "扫描中…" },
  "mcp.import": { en: "import", zh: "导入" },
  "mcp.importSelected": { en: "import selected", zh: "导入选中" },
  "mcp.configured": { en: "configured", zh: "已配置" },
  "agents.launch": { en: "launch", zh: "启动" },
  "agents.stop": { en: "stop", zh: "停止" },
  "agents.logs": { en: "logs", zh: "日志" },
  "agents.hideLogs": { en: "hide logs", zh: "收起日志" },
  "agents.model": { en: "model…", zh: "模型…" },
  "agents.notInstalled": { en: "not installed", zh: "未安装" },
  "agents.notLaunched": { en: "not launched", zh: "未启动" },
  "agents.running": { en: "running", zh: "运行中" },
  "agents.exited": { en: "exited", zh: "已退出" },
  "skills.syncNow": { en: "sync now", zh: "立即同步" },
  "vault.store": { en: "store", zh: "保存" },
  "vault.test": { en: "test", zh: "测试" },
  "vault.delete": { en: "delete", zh: "删除" },
  "status.engine": { en: "engine", zh: "引擎" },
  "status.offline": { en: "offline", zh: "离线" },
};

type I18nCtx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string };

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("toondeck.lang");
    return saved === "zh" || saved === "en" ? saved : "en";
  });
  const t = (k: string) => DICT[k]?.[lang] ?? k;
  const wrap = (l: Lang) => {
    localStorage.setItem("toondeck.lang", l);
    setLang(l);
  };
  return <Ctx.Provider value={{ lang, setLang: wrap, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
