import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "zh";

// R42: exported (readonly by convention) so CjkLiteralGate can hold the DICT
// itself to the same discipline as the chrome — en values must stay CJK-free.
export const DICT: Record<string, { en: string; zh: string }> = {
  // R53: the deck landing page is gone — #/ is the portal gate now
  // R53: portal password gate
  "portal.lockTitle": { en: "admin console — password required", zh: "管理后台——请输入密码" },
  "portal.firstRun": {
    en: "First run: the default password is admin123 — after signing in you can change it in the sidebar.",
    zh: "首次使用：默认密码 admin123——登录后可在侧栏修改。",
  },
  "portal.placeholder": { en: "password", zh: "密码" },
  "portal.unlock": { en: "unlock", zh: "进入后台" },
  "portal.wrong": { en: "wrong password", zh: "密码不对" },
  "portal.forgot": {
    en: "Forgot it? Stop the deck, delete portal.json in ~/.toondeck, start again → password resets to admin123.",
    zh: "忘记密码？停掉 deck，删除 ~/.toondeck 下的 portal.json，重启即恢复默认密码 admin123。",
  },
  "portal.change": { en: "change password", zh: "修改密码" },
  "portal.currentPw": { en: "current password", zh: "当前密码" },
  "portal.newPw": { en: "new password (min 6 chars)", zh: "新密码（至少 6 位）" },
  "portal.changeDone": { en: "password changed", zh: "密码已修改" },
  "portal.lock": { en: "lock", zh: "锁定" },
  // R53 小白-1: the one-line human intro (the landing page is gone; the lock
  // screen is the first thing a newcomer sees)
  "portal.oneliner": {
    en: "Collect the MCP tools, skills and model keys scattered across your AI agents into one panel.",
    zh: "把你所有 AI agent 的 MCP 工具、技能、模型密钥，收进一张面板统一管理。",
  },
  // R54: per-page tutorials — answer "do I need to configure anything?" and
  // "which button do I press?" in ≤3 steps, collapsible, per-page memory
  "howto.title": { en: "how to use this page", zh: "这页怎么用" },
  "howto.hide": { en: "hide", zh: "收起" },
  "howto.show": { en: "show", zh: "展开" },
  "howto.mcp.1": {
    en: "No configuration needed — the list below is scanned from the agent configs already on this machine.",
    zh: "无需任何配置——下面的列表是从本机各 agent 已有配置里自动扫描出来的。",
  },
  "howto.mcp.2": {
    en: "Click a row to see its tools; press “import & manage” on a row you want under management.",
    zh: "点任意一行看它的工具；想接管哪行就点行内的「导入接管」。",
  },
  "howto.mcp.3": {
    en: "Then: “run health check” grades connectivity; “sync all agents” writes the result back to every agent.",
    zh: "然后：点「run health check」体检连通性；点「sync all agents」把接管结果写回所有 agent。",
  },
  "howto.skills.1": {
    en: "No configuration needed — skills are read from ~/.toondeck/skills automatically.",
    zh: "无需任何配置——技能自动从 ~/.toondeck/skills 读取。",
  },
  "howto.skills.2": {
    en: "Click a category pill to browse, or just type in the search box to flatten everything.",
    zh: "点分类标签浏览，或直接在搜索框打字摊开全部结果。",
  },
  "howto.skills.3": {
    en: "Each card: “sync” pushes it to every agent's shelf; “remove” asks first and keeps a recycle copy.",
    zh: "每张卡：「同步」推送到所有 agent 的技能架；「移除」先确认且留有回收站副本。",
  },
  "howto.agents.1": {
    en: "No configuration needed — installed agents on this machine are detected automatically.",
    zh: "无需任何配置——本机已装的 agent 自动发现。",
  },
  "howto.agents.2": {
    en: "Press “launch” to start one; keys stored in the vault are injected automatically.",
    zh: "点「启动」拉起 agent；保险库里存过的密钥会自动注入。",
  },
  "howto.agents.3": {
    en: "Model source / model can be switched anytime; live logs stream in the card.",
    zh: "模型源和模型随时可换；日志实时显示在卡片里。",
  },
  "howto.logs.1": {
    en: "No configuration needed — every deck action (probe, sync, launch) is recorded here automatically.",
    zh: "无需任何配置——deck 的每个动作（体检/同步/启动）都自动记录在这里。",
  },
  "howto.logs.2": {
    en: "Something broke? Download the md report on an agent card and hand it to the agent to fix.",
    zh: "出问题了？在 agent 卡片下载 md 报告，直接丢给 agent 让它自己修。",
  },
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
    en: "Sync writes the ToonDeck toolset into every detected agent, overwriting its MCP server list. Continue?",
    zh: "同步会把 ToonDeck 工具集写入所有已检测到的 agent（覆盖其 MCP 配置清单）。继续？",
  },
  "agents.launch": { en: "launch", zh: "启动" },
  "agents.stop": { en: "stop", zh: "停止" },
  "agents.starting": { en: "starting…", zh: "启动中…" },
  "agents.stopping": { en: "stopping…", zh: "停止中…" },
  "mcp.healthWall": { en: "sweep took {s}s", zh: "本轮探测耗时 {s}s" },
  "mcp.healthBtn": { en: "run health check", zh: "全量体检" },
  "mcp.syncing": { en: "syncing…", zh: "同步中…" },
  "mcp.healthCap": { en: "per-server cap ≤{n}s", zh: "单 server 上限 ≤{n}s" },
  "mcp.healthRerun": { en: "re-run", zh: "再跑一轮" },
  "agents.logs": { en: "logs", zh: "日志" },
  "agents.hideLogs": { en: "hide logs", zh: "收起日志" },
  "agents.model": { en: "model…", zh: "模型…" },
  // 小白-4: the collapsed evidence label (plain words, no exe:/dir: noise)
  "agents.evidence": { en: "detection details", zh: "探测详情" },
  "agents.evCommand": { en: "command", zh: "命令" },
  "agents.evFolder": { en: "folder", zh: "目录" },
  "agents.evidenceLegend": {
    en: "✓ found · ✗ missing — these checks only decide the installed badge",
    zh: "✓ 检测到 · ✗ 未检测到——这些证据只决定「已装好」的标记",
  },
  "portal.forgotShort": {
    en: "Forgot the password? You can never get locked out — tap for the reset steps.",
    zh: "忘记密码？不会被锁死——点开看找回步骤。",
  },
  // N-R2: the first-hour starter checklist
  "cl.title": { en: "First hour: three steps and you own the deck", zh: "上手三步，牌桌就是你的了" },
  "cl.subtitle": {
    en: "Do them in the app — each one ticks itself off.",
    zh: "都在界面里点得到——做完一步自动打勾。",
  },
  "cl.dismiss": { en: "dismiss", zh: "知道了，收起" },
  "portal.errCurrent": { en: "the current password is not right — try again", zh: "当前密码不对——再试一次" },
  "portal.errPrefix": { en: "change failed: ", zh: "修改失败：" },
  "cl.step.pw": { en: "Change the default password (sidebar → change password)", zh: "改掉默认密码 admin123（侧栏 →「修改密码」）" },
  "cl.step.health": { en: "Run one health check on the MCP page", zh: "在 MCP 页跑一次「全量体检」" },
  "cl.step.sync": { en: "Sync all agents so every agent gets the same tools", zh: "「同步全部 agent」，让每个 agent 拿到同一份工具" },
  "agents.notInstalled": { en: "not found — install it first", zh: "没找到 · 需要先安装" },
  "agents.notLaunched": { en: "installed — press launch", zh: "已装好 · 点启动就行" },
  "agents.running": { en: "running", zh: "运行中" },
  "agents.exited": { en: "exited", zh: "已退出" },
  "agents.windowLaunched": { en: "opened in a desktop window", zh: "已在桌面打开终端窗口" },
  "agents.downloadLog": { en: "download log report (hand it to an agent to debug)", zh: "下载日志报告（可直接丢给 agent 分析修复）" },
  "agents.discover": { en: "discover agents", zh: "发现 agent" },
  "agents.adopt": { en: "adopt", zh: "收编" },
  "agents.adopted": { en: "adopted", zh: "已收编" },
  "agents.probe": { en: "probe", zh: "探测" },
  "agents.launchCmd": { en: "launch command…", zh: "启动命令…" },
  "agents.addLaunchCmd": { en: "add launch command", zh: "添加启动命令" },
  "agents.saveCmd": { en: "save", zh: "保存" },
  "agents.vaultLink": { en: "manage & test in Vault →", zh: "在 Vault 页管理/测试 →" },
  "vault.relation": {
    en: "The Agents page catalog is for quick enabling; this Vault is full management — store keys, test them, delete them.",
    zh: "Agents 页的提供商目录=快捷启用；本保险库=全量管理（存密钥 / 测试 / 删除）。",
  },
  "vault.providers": {
    en: "of {n} providers · keys live in your OS keychain, never on disk",
    zh: "共 {n} 个 provider · 密钥只进 OS 钥匙串，绝不落盘",
  },
  "vault.deleteConfirm": {
    en: "Delete stored key for {id}? The OS keychain entry will be removed.",
    zh: "删除 {id} 的已存密钥？（OS 钥匙串条目将被移除）",
  },
  "vault.store": { en: "store", zh: "保存" },
  "vault.test": { en: "test", zh: "测试" },
  "vault.delete": { en: "delete", zh: "删除" },
  "vault.stored": { en: "● key stored in keychain", zh: "● 密钥已存入钥匙串" },
  "vault.local": { en: "local provider — no key required", zh: "本地 provider——无需密钥" },
  "vault.lastProbe": { en: "last probe: {result}", zh: "上次探测：{result}" },
  "vault.failedHint": {
    en: "probe failed — re-store a corrected key, delete it, or switch to another model in Agents.",
    zh: "探测失败——重存一把修正后的 key、删除它，或去 Agents 页换其他模型。",
  },
  "vault.reStore": { en: "re-store", zh: "重存" },
  // R48: vault guide + user-defined providers
  "vault.guideTitle": { en: "how the vault works", zh: "保险库怎么用" },
  "vault.guideStep1": {
    en: "① store a key — it lands in your OS keychain, never plaintext on disk",
    zh: "① 存入密钥——进系统钥匙串，绝不落明文",
  },
  "vault.guideStep2": {
    en: "② test it — a real probe hits the provider endpoint and grades the result",
    zh: "② 实测——对 provider 端点发真实探测并给出结论",
  },
  "vault.guideStep3": {
    en: "③ launch with “use vault” — stored keys are injected as env vars (OPENAI_API_KEY…) into the agent process",
    zh: "③ 启动时勾选“使用保险库”——已存密钥以环境变量（OPENAI_API_KEY…）注入 agent 进程",
  },
  "vault.guideAlias": {
    en: "agents reading a non-catalog env name (e.g. ANTHROPIC_AUTH_TOKEN) can be fed from a stored provider via launch aliases — the secret still never crosses the browser",
    zh: "agent 读非目录内的环境变量名（如 ANTHROPIC_AUTH_TOKEN）时，可在启动别名里从已存 provider 取值——密钥同样不经过浏览器",
  },
  "vault.addProvider": { en: "+ custom provider", zh: "+ 自定义 provider" },
  "vault.customBadge": { en: "custom", zh: "自定义" },
  "vault.editProvider": { en: "edit", zh: "编辑" },
  "vault.removeProvider": { en: "remove", zh: "移除" },
  "vault.removeProviderConfirm": {
    en: "Remove custom provider {id}? Its stored key (if any) is deleted from the keychain.",
    zh: "移除自定义 provider {id}？其已存密钥（如有）将从钥匙串删除。",
  },
  "vault.fieldId": { en: "id (lowercase slug)", zh: "id（小写标识）" },
  "vault.fieldDisplayName": { en: "display name", zh: "显示名" },
  "vault.fieldEnvVar": { en: "env var (injected at launch)", zh: "环境变量名（启动时注入）" },
  "vault.fieldBaseUrl": { en: "base URL", zh: "Base URL" },
  "vault.fieldTestUrl": { en: "test URL (defaults to base URL)", zh: "探测 URL（留空用 Base URL）" },
  "vault.fieldAuthStyle": { en: "auth style", zh: "认证方式" },
  "vault.authBearer": { en: "Bearer token", zh: "Bearer 令牌" },
  "vault.authXApiKey": { en: "x-api-key header", zh: "x-api-key 请求头" },
  "vault.authQuery": { en: "?key= query param", zh: "?key= 查询参数" },
  "vault.authNone": { en: "no auth (local)", zh: "无认证（本地）" },
  "vault.localLabel": { en: "local service (no key needed)", zh: "本地服务（无需密钥）" },
  "vault.providerSaved": { en: "saved", zh: "已保存" },
  "confirm.cancel": { en: "cancel", zh: "取消" },
  "mcp.syncConfirm": { en: "overwrite & sync now", zh: "覆盖并立即同步" },
  "agents.noUnknown": { en: "no unrecognized agents — all accounted for ✓", zh: "无陌生 agent——全部在册 ✓" },
  "status.engine": { en: "engine", zh: "引擎" },
  "status.offline": { en: "offline", zh: "离线" },
  // UX-C1: fleet dashboard + panel chrome
  "fleet.overview": { en: "🚀 mcptoon fleet overview", zh: "🚀 mcptoon 舰队总览" },
  "fleet.capabilities": { en: "capabilities, all managed by mcptoon", zh: "个能力，全部由 mcptoon 统一管理" },
  "fleet.probing": { en: "probing everything…", zh: "全量实探中…" },  "fleet.summary": {
    en: "{tools} MCP tools + {skills} skills + {agents} CLI agents",
    zh: "{tools} MCP 工具 + {skills} 技能 + {agents} CLI agents",
  },
  "fleet.mcpTools": { en: "MCP tools (live-probed)", zh: "MCP 工具（全量实探）" },
  "fleet.adoptedSub": { en: "{a} adopted · {d} more found, ready to adopt", zh: "{a} 已接管 · {d} 发现待收编" },
  "fleet.firstScan": { en: "first full scan takes ~10-30s", zh: "首次全量扫描约 10-30 秒" },
  "fleet.skills": { en: "skills (gbrain/jiyi & more)", zh: "技能（含 gbrain/jiyi 等）" },
  "fleet.skillsSub": { en: "{total} in total · views {ok}/{views} healthy", zh: "{total} 总数 · 视图 {ok}/{views} 健康" },
  "fleet.launchable": { en: "{n} launchable in one click", zh: "{n} 个可一键启动" },
  "fleet.bySource": { en: "tool sources:", zh: "工具来源：" },
  "fleet.deckVsEngine": {
    en: "ToonDeck is the cockpit — mcptoon is the engine doing the scanning, syncing and launching underneath.",
    zh: "ToonDeck 是驾驶舱——底下干活的引擎是 mcptoon：扫描、同步、启动都是它在做。记住它，命令行里用的也是这个名字。",
  },
  "fleet.dedupNote": {
    en: "sources add up to {sum} — one tool via several agents counts once: {total} unique",
    zh: "按来源相加是 {sum} —— 同一工具被多个 agent 配置时只计一次，去重后共 {total} 个",
  },
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
    en: "health check failed — a server timed out or the engine is not responding (35s cap). Retry any time.",
    zh: "体检失败——有 server 超时或引擎无响应（35s 上限），可直接重试",
  },
  // UX-C1 part 2: agents provider catalog + custom source + TUI explainer
  "agents.providers": { en: "🔌 model providers ({ok}/{n} enabled)", zh: "🔌 模型提供商（{ok}/{n} 已启用）" },
  // 小白-5: the benefit line — WHY enable a provider at all
  "agents.providersHint": {
    en: "Once enabled, agents can use this provider's models; keys stay in the local vault.",
    zh: "启用后 agent 即可用此家模型；密钥只存在本机保险库里。",
  },
  "agents.modelsCount": { en: "({n} models)", zh: "({n} 模型)" },
  "agents.enabled": { en: "✓ enabled", zh: "✓ 已启用" },
  // R46: provider dialog — edit-in-place inline inputs are gone
  "agents.editSource": { en: "edit", zh: "修改" },
  "agents.addSource": { en: "add source", zh: "新增来源" },
  "agents.nameLabel": { en: "Name", zh: "名称" },
  "agents.urlLabel": { en: "Base URL", zh: "Base URL" },
  "agents.keyLabel": { en: "API key", zh: "API Key" },
  "agents.keyKeepHint": { en: "leave blank to keep the stored key", zh: "留空则保留已存密钥" },
  "agents.keyNewHint": { en: "goes to the OS keychain, never plain files", zh: "存入系统钥匙串，绝不落明文文件" },
  "agents.keyMissing": { en: "an API key is required", zh: "需要填写 API Key" },
  "agents.showKey": { en: "show key", zh: "显示密钥" },
  "agents.hideKey": { en: "hide key", zh: "隐藏密钥" },
  "agents.keyStoredChip": { en: "🔑 key stored", zh: "🔑 密钥已存" },
  "agents.sourceSaved": { en: "saved", zh: "已保存" },
  "agents.disable": { en: "disable", zh: "停用" },
  "agents.enableKeyless": { en: "enable (local, keyless)", zh: "一键启用（本地免 Key）" },
  "agents.enable": { en: "enable", zh: "启用" },
  "agents.cancel": { en: "cancel", zh: "取消" },
  "agents.keyPlaceholder": { en: "API key (goes to OS keychain)", zh: "API Key（进系统钥匙串）" },
  "agents.customSource": { en: "＋ custom source (any OpenAI-compatible gateway)", zh: "＋ 自定义源（任意 OpenAI 兼容网关）" },
  "agents.profileName": { en: "name (e.g. my-proxy)", zh: "名称 (如 my-proxy)" },
  "agents.baseUrl": { en: "base URL (https://…/v1)", zh: "Base URL (https://…/v1)" },
  "agents.save": { en: "save", zh: "保存" },
  // R51: hover-only explanations became persistent micro-copy (P1-2)
  "agents.guiOnlyHint": {
    en: "GUI-only agent — no launch command; add one to enable launching.",
    zh: "仅桌面窗 agent——暂无启动命令；添加一条即可启用启动按钮。",
  },
  "agents.sourceLabel": { en: "API model source:", zh: "API 模型源：" },
  "agents.defaultApi": { en: "default API", zh: "默认 API" },
  "agents.windowLog": {
    en: "🪟 logs stream in their own desktop window — this panel only records pipe-mode launches.",
    zh: "🪟 日志在桌面窗口内运行 — 下方的环形记录仅捕获管道启动。",
  },
  // logs panel
  "logs.subtitle": { en: "live logs · download an md report to hand any agent for self-repair", zh: "实时日志 · 下载 md 报告直接丢给任意 agent 自修" },
  "logs.running": { en: "running · pid {pid}", zh: "运行中 · pid {pid}" },
  "logs.exited": { en: "exited · code {code}", zh: "已退出 · code {code}" },
  "logs.downloadMd": { en: "⬇ md report", zh: "⬇ 下载 md 报告" },
  "agents.selffixPre": { en: "Agent exited with a problem?", zh: "agent 挂了？" },
  "agents.bulkTitle": { en: "set one model for every agent", zh: "给所有 agent 一次设好模型" },
  "agents.bulkHint": {
    en: "Any model name works — it is passed to the agent as-is (custom models welcome). Per-agent tweaks stay on each card below.",
    zh: "模型名随便填，原样传给 agent（自定义模型也行）。想单独设置，就在下面每张卡上改。",
  },
  "agents.bulkPlaceholder": { en: "e.g. claude-sonnet-4-5", zh: "如 claude-sonnet-4-5" },
  "agents.bulkApply": { en: "apply to all agents", zh: "应用到全部 agent" },
  "agents.bulkConfirm": {
    en: "Set all {n} agents' model to {model}? Per-card overrides will be replaced.",
    zh: "把全部 {n} 个 agent 的模型改成 {model}？各卡片上单独设置的会被覆盖。",
  },
  "agents.bulkGo": { en: "yes, set all", zh: "确认，全部改" },
  "agents.bulkDone": { en: "switched {n} agents to {model}", zh: "已把 {n} 个 agent 的模型切到 {model}" },
  "agents.selffixPost": {
    en: " and hand it to any agent — ask it to diagnose and fix the launch.",
    zh: " 下载后丢给任意 agent（claude/codex 都行），让它自己诊断修复。",
  },
  "logs.collapse": { en: "collapse", zh: "收起" },
  "logs.live": { en: "live log", zh: "实时日志" },
  "logs.filterPlaceholder": { en: "🔍 filter lines…", zh: "🔍 过滤日志行…" },
  "logs.filterCount": { en: "{n} matching lines", zh: "{n} 行匹配" },
  "logs.filterCapped": { en: "showing first {shown} of {total} matches", zh: "仅显示前 {shown} / {total} 条" },
  "logs.noMatch": { en: "no lines match", zh: "无匹配行" },
  "logs.never": {
    en: "never launched: {names} — start them on the Agents page and their logs will appear here.",
    zh: "未启动过的 agent：{names} — 去 Agents 页一键启动后，日志会出现在这里。",
  },
  "logs.empty": {
    en: "no agent pipe logs yet — launch an agent (Agents page). Deck actions are recorded below in the activity journal.",
    zh: "还没有 agent 管道日志 — 去 Agents 页启动一个。deck 自身的动作会记录在下方活动日志里。",
  },
  // R45: activity journal — what the deck itself did (honest ledger, not pipe logs)
  "logs.activityTitle": { en: "Activity", zh: "活动日志" },
  "logs.activityHint": { en: "what the deck itself did — checks, syncs, launches, probes", zh: "deck 自身的动作 — 体检、同步、启动、探针" },
  "logs.actHealth": { en: "MCP health check", zh: "MCP 体检" },
  "logs.actSync": { en: "MCP config sync", zh: "MCP 配置同步" },
  "logs.actSkillsSync": { en: "skills sync", zh: "技能同步" },
  "logs.actSkillsSyncOne": { en: "skill sync", zh: "单技能同步" },
  "logs.actLaunch": { en: "agent launch", zh: "启动 agent" },
  "logs.actStop": { en: "agent stop", zh: "停止 agent" },
  "logs.actProbe": { en: "vault probe", zh: "密钥探针" },
  "logs.actAdopt": { en: "agent adopt", zh: "收编 agent" },
  "logs.actUnknown": { en: "event", zh: "事件" },
  "logs.actOk": { en: "ok", zh: "成功" },
  "logs.actFail": { en: "failed", zh: "失败" },
  "logs.actEmpty": {
    en: "nothing yet — run a health check or sync and it will show up here.",
    zh: "还没有记录 — 跑一次体检或同步，动作就会记在这里。",
  },
  // skills pills
  "skills.searchPlaceholder": { en: "🔍 search skill names or descriptions…", zh: "🔍 搜索技能名或描述…" },
  // R50: collapsed-by-default categories ("all" pill retired — the default
  // view is collapsed; search flattens everything)
  "skills.pickCategory": {
    en: "↑ pick a category to browse its skills — or search to flatten everything.",
    zh: "↑ 点一个分类浏览该组技能——或直接搜索摊开全部结果。",
  },
  "skills.searchHits": { en: "{n} match(es)", zh: "{n} 个匹配" },
  "skills.matchesHint": { en: "matches", zh: "匹配规则" },
  "skills.groupsLabel": { en: "skill categories", zh: "技能分类" },
  "skills.noMatch": { en: "no matching skills — try another category or search term.", zh: "没有匹配的技能 — 换个分类或搜索词。" },
  // R33: empty states
  "agents.emptyTitle": { en: "no agents detected yet", zh: "尚未发现任何 agent" },
  "agents.emptyHint": {
    en: "Install a supported CLI agent and it appears here automatically.",
    zh: "安装受支持的 CLI agent 后会自动出现在这里。",
  },
  "mcp.emptyTitle": { en: "no MCP servers under management", zh: "还没有被接管的 MCP server" },
  "mcp.emptyHint": {
    en: "Run a discovery from your agent configs and adopt the servers you trust.",
    zh: "从各 agent 配置里跑一次发现，把你信任的 server 一键收编。",
  },
  // R47: unified server table
  "mcp.badgeManaged": { en: "managed", zh: "已接管" },
  "mcp.badgeDiscovered": { en: "discovered", zh: "待收编" },
  "mcp.toolsCount": { en: "{n} tools", zh: "{n} 个工具" },
  "mcp.toolsOff": { en: "tools off — click to re-enable", zh: "已关工具 — 点击重新开启" },
  "mcp.noTools": { en: "no tools exposed", zh: "未暴露任何工具" },
  "mcp.adoptOne": { en: "adopt into my config", zh: "收编进我的配置" },
  "mcp.adoptHint": {
    en: "Discovered in {src}'s config, not yet yours. Adopting copies it into your single source of truth — managed here from now on.",
    zh: "这是在 {src} 的配置里发现的，还没归你管。收编后会复制进你的单一真源，以后都在这里统一管理。",
  },
  "mcp.universe": { en: "{managed} managed · {discovered} awaiting adoption", zh: "{managed} 个已接管 · {discovered} 个待收编" },
  "vault.emptyTitle": { en: "no providers detected", zh: "未发现任何 provider" },
  "vault.emptyHint": {
    en: "Provider profiles ship with the CLI agents you install — they land here.",
    zh: "provider 随 CLI agent 安装自带——装好就会出现在这里。",
  },
  "skills.emptyTitle": { en: "no skills yet", zh: "还没有技能" },
  "skills.emptyHint": {
    en: "Skills register themselves as agents sync them — hit refresh after a sync.",
    zh: "agent 同步时会自动注册技能——同步完点刷新。",
  },
  // UX-017: per-card actions
  "skills.cardSync": { en: "sync", zh: "同步" },
  "skills.cardSyncing": { en: "syncing…", zh: "同步中…" },
  "skills.cardRemove": { en: "remove", zh: "移除" },
  "skills.cardDetails": { en: "details", zh: "详情" },
  "skills.cardFolder": { en: "folder", zh: "目录" },
  "skills.cardErrors": { en: "problems:", zh: "问题：" },
  "skills.syncOneDone": { en: "synced \"{name}\" to all agent views", zh: "已将「{name}」同步到全部 agent 视图" },
  "skills.syncOneFail": { en: "sync failed for \"{name}\"", zh: "「{name}」同步失败" },
  "skills.removeDone": { en: "removed \"{name}\" — recoverable from the recycle bin", zh: "已移除「{name}」——可在回收站找回" },
  "skills.removeFail": { en: "remove failed for \"{name}\"", zh: "「{name}」移除失败" },
  "skills.removeWarn": {
    en: "Remove \"{name}\"? It moves to the recycle bin and every agent view loses it. Recoverable by hand.",
    zh: "移除「{name}」？技能将移入回收站，所有 agent 目录不再包含它。可手动找回。",
  },
  "skills.removeConfirm": { en: "remove skill", zh: "确认移除" },
  "skills.invalidBadge": { en: "invalid", zh: "无效" },
  // R53: console landing page retired behind the portal gate — the onboard.*
  // decision-tree keys and the tagline died with it (portal.* replaced them)
  // R44: LED state labels (screen readers; the dot is the only state signal)
  "led.ok": { en: "ok", zh: "正常" },
  "led.warn": { en: "degraded", zh: "有恙" },
  "led.err": { en: "error", zh: "异常" },
  "led.off": { en: "off", zh: "未启" },
  "led.installed": { en: "installed", zh: "已安装" },
  "led.notInstalled": { en: "not installed", zh: "未安装" },
  "led.running": { en: "running", zh: "运行中" },
  "led.exited": { en: "exited", zh: "已退出" },
  "led.keyStored": { en: "key stored", zh: "密钥已存" },
  "led.noKey": { en: "no key", zh: "无密钥" },
  "led.local": { en: "local provider", zh: "本地 provider" },
  "led.timeout": { en: "timed out", zh: "超时" },
  // N-lane (novice UX): help exit + skills terminology greening
  "footer.github": { en: "GitHub · source & issues", zh: "GitHub · 源码与反馈" },
  "skills.doctorBtn": { en: "health check", zh: "体检" },
  "skills.doctorLed": { en: "health check: {summary}", zh: "体检：{summary}" },
  "skills.doctorLine": { en: "health check: {summary} · {n} in the recycle bin", zh: "体检：{summary} · 回收站 {n} 条" },
  "skills.syncAll": { en: "sync all agents", zh: "同步全部 agent" },
  // 小白-7: the danger-family tooltip — what sync actually overwrites
  "skills.syncWarnTitle": {
    en: "Danger: overwrites every agent's skill shelf with the deck's version",
    zh: "危险操作：会用牌桌版本覆盖所有 agent 的技能架",
  },
  "skills.watchOn": { en: "● watching for changes", zh: "● 实时守护中" },
  "skills.watchOff": { en: "○ watch for changes", zh: "○ 实时守护关" },
  "skills.watchHint": {
    en: "re-sync skills automatically when the source folder changes",
    zh: "技能源目录变化时自动重新同步",
  },
  "skills.viewsTitle": { en: "synced to each agent's skill folder", zh: "已同步到各 agent 的技能目录" },
  // 小白-6: the subtitle under AGENT VIEWS — what a green lamp actually means
  "skills.viewsSubtitle": {
    en: "Each lamp = one agent's skill folder. Green means it can see every skill above.",
    zh: "一盏灯 = 一个 agent 的技能目录；绿灯 = 它能看到上面所有技能。",
  },
  "skills.showMore": { en: "show {n} more skills", zh: "展开其余 {n} 个技能" },
  "skills.unreachableTitle": { en: "engine unreachable", zh: "引擎连不上了" },
  "skills.unreachableHint": {
    en: "Skills read from the local engine — is the deck still running? Check the console, then refresh.",
    zh: "技能数据来自本地引擎——deck 是否还在运行？确认命令行窗口没关，然后点下面刷新。",
  },
};

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
};

function resolve(lang: Lang, k: string, vars?: Record<string, string | number>) {
  let s: string = DICT[k]?.[lang] ?? k;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      s = s.replaceAll(`{${name}}`, String(value));
    }
  }
  return s;
}

// R26: components rendered outside a provider (tests, future portals) used to
// get an identity t() that leaked raw keys into the UI ("mcp.syncWarn" as
// visible text). The default context now resolves real English — same strings
// the en UI shows.
const Ctx = createContext<I18nCtx>({
  lang: "en",
  setLang: () => {},
  t: (k, vars) => resolve("en", k, vars),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("toondeck.lang");
    return saved === "zh" || saved === "en" ? saved : "en";
  });
  // P0-1 (R49): keep <html lang> in lockstep with the UI language — screen
  // readers pick pronunciation rules from the document attribute, so a UI
  // showing Chinese while the document claims English is read with English
  // phonetics. Sync once on mount (restored preference) and on every change.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = (k: string, vars?: Record<string, string | number>) => resolve(lang, k, vars);
  const wrap = (l: Lang) => {
    localStorage.setItem("toondeck.lang", l);
    setLang(l);
  };
  return <Ctx.Provider value={{ lang, setLang: wrap, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
