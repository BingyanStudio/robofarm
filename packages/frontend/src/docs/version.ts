// Version number and update log management.
// - Version number is always shown in the top title bar (small gray text)
// - On page load, check localStorage:
//   1. No version (first visit) -> auto-expand right-hand API manual
//   2. Older or unrecognized version -> show update log
//   3. Write current version number (for next comparison)
import { el, modal } from '../ui/ui';
import { GAME_VERSION } from '@robofarm/shared';

export const VERSION = GAME_VERSION;
export const VERSION_KEY = 'robofarm.version';

export interface UpdateEntry {
    version: string;
    title: string;
    items: string[];
}

/** Update log (from newest to oldest) */
export const UPDATE_LOG: UpdateEntry[] = [
    {
        version: '2.0.0',
        title: 'v2.0.0',
        items: [
            '## 新机制',
            '土地肥力: 土地新增肥力属性 (初始 5, 上限 10), 可通过 getTile() 查询; 收获作物时扣除作物的肥力消耗, 肥力 < 0 → 沙漠化 (转沙地), 肥力 > 上限 → 盐碱化 (转盐碱地)',
            '新地块 盐碱地: 生长周期 ×1.5 且浇水次数 ×2',
            '新操作 Fertilize / FertilizeRow / FertilizeCol: 给土地施肥 +3 肥力 (单格 3 能量 / 行·列 8 能量), 非土地单格失败不扣能量、行·列跳过',
            '新作物 仙人掌 (cactus): 可种沙地/盐碱地, 生长固定 15 周期 (不受环境 debuff 影响), 收获后把脚下地块转为土地 (肥力 2)',
            '浇水时机改为种植时随机选取 (每局随机种子, 对玩家不可预测, 避免硬编码; 种子计入回放文件, 回放结果与游玩一致)',
            '## 平衡性调整',
            '沙地生长周期惩罚 ×1.5 → ×3',
            '作物属性改为按总缺水次数记录 (thirstCountBase): 小麦 2 次 / 南瓜 5 次 / 西瓜 8 次 / 紫云英 2 次 / 香菇 1 次 (香菇浇水固定为 1)',
            '西瓜: 成本 1000 / 收获 2000 / 80 周期 / 耗肥 6, 可种盐碱地',
            '南瓜: 成本 300 / 收获 700 / 50 周期 / 耗肥 3, 可种盐碱地',
            '小麦: 收获 180, 可种除水池外的任何地块',
            '紫云英: 收获 120 / 30 周期 / 恢复肥力 4 / 每回合加速 1 株邻格作物, 只能在肥力 < 6 的土地或沙地种植',
            'ChangeTile 能耗 6 → 3, 转为土地时肥力为 0',
            '## 界面改进',
            'Tile 信息 Tooltip: 土地显示肥力; 竞技模式显示 己方/对方半场',
            '作物 API 手册: 新增种植条件描述 (canPlantDesc), 展示各作物的可种地块与肥力要求',
            '## 架构重构',
            '作物/地块/无人机操作全部改为单文件单类 (crops/ tiles/ ops/ 目录), 引擎零 if 硬编码, 新增内容只改注册表',
            '## 排行榜',
            '进入 v2.x 大版本: V1.x 时代排行榜已冻结保留, 新排行榜从空开始',
        ],
    },
    {
        version: '1.0.8',
        title: 'v1.0.8',
        items: [
            '## UI',
            '统计界面优化: 新增作物收入饼图; 优化图表配色',
            '排行榜优化: 使用柱状图表征得分差距',
            '新增 "分享" 功能: 单人模式可在 "我的成绩" 中生成分享图片',
            '## Bugfix',
            '修复单人模式浏览器模拟时, 生成回放数据为空的问题',
            '修复回合数统计错误的问题',
        ],
    },
    {
        version: '1.0.7',
        title: 'v1.0.7',
        items: [
            '## 统计',
            '新增对局统计: 对局结束后自动弹出统计弹窗 (单人种植与模拟竞技本地运行); 服务器验证对局可在历史记录中点击"统计"查看',
            '统计内容包括: 最终得分、金钱随回合变化的折线图 (悬停可查看任意回合双方金钱, 曲线已平滑) 与种植构成进度条 (绿蓝黄色系按占比排列)',
            '## 文档',
            'LLM 接入链接由 /llm.txt 调整为 /llms.txt (旧链接自动跳转)',
        ],
    },
    {
        version: '1.0.6',
        title: 'v1.0.6',
        items: [
            '## 登录',
            '修复: 通过 MCP 接入时的登录问题 (授权流程与网页登录保持一致, 服务器重启后仍可正常登录)',
            '## 界面',
            '开始 / 停止按钮恢复常规按钮外观, 以绿色 (开始) / 红色 (停止) 作强调; 单人种植与模拟竞技的开始按钮初始即为绿色',
            '排行榜: 按钮与个人成绩条目统一为金色高亮 (原条目为绿色边框)',
        ],
    },
    {
        version: '1.0.5',
        title: 'v1.0.5',
        items: [
            '## 界面',
            '主菜单 MCP 卡片改为可折叠 (初始默认折叠), 标题更名为 "Agent 接入"',
            '主菜单 Logo 背后新增与界面主色系相符的模糊亮光 (呼吸动画)',
            '## 登录',
            '修复: MCP 登录工具生成的 OAuth 回调地址未遵循 GITHUB_REDIRECT_URI / BACKEND_ORIGIN 环境变量配置, 反向代理部署下授权可能失败 (redirect_uri_mismatch)',
        ],
    },
    {
        version: '1.0.4',
        title: 'v1.0.4',
        items: [
            '## 登录',
            '修复: GitHub 登录偶尔提示 "OAuth 状态无效或已过期, 请重新登录" 的问题 (state 校验不再依赖进程内存, 服务器重启或多实例部署也能正常登录)',
            '登录后右上角头像显示为 GitHub 头像 (本地开发账号仍为首字母色块)',
            '## 界面',
            '作物缺水时右上角新增 💧 提示图标, 更直观',
            '排行榜前三名分别以 🥇🥈🥉 标注',
        ],
    },
    {
        version: '1.0.3',
        title: 'v1.0.3',
        items: [
            '## 界面',
            '大规模 UI 风格与细节调整',
            '增加 Bingyan Logo 与 Github 仓库链接',
            '## 文档',
            '优化 [规则] 部分的文字描述与阅读体验',
        ],
    },
    {
        version: '1.0.2',
        title: 'v1.0.2',
        items: [
            '## 排行榜',
            '排行榜按版本 Tab 展示 (当前版本标签为 v1.x), 每个版本始终显示前 50 名, 前三名用奖牌 Emoji 标注',
            '登录玩家的排名: 在前 50 名内则原位高亮; 未进入则作为吸附行追加在榜单内 (滚动时贴住可视区边缘, 可见时原位); 未提交过代码则不显示',
            '新增按用户名查询个人得分与全榜名次的能力',
            '修复: 榜单内容过高时不再出现弹窗外层的第二根滚动条 (仅列表内部滚动)',
            '## 其他',
            '网站图标更新为 RoboFarm 专属图标',
        ],
    },
    {
        version: '1.0.1',
        title: 'v1.0.1',
        items: [
            '## 体验优化',
            '服务器繁忙保护: 验证提交过频或高峰期时, 会提示"服务器繁忙, 请稍后重试"',
            '首次编译会下载编译器, 日志中会明确提示"首次编译, 正在下载编译器…"',
            '## 界面',
            '多人竞技左侧面板: 出战状态与"模拟竞技 / 上传代码"按钮移到"出战代码"栏右对齐; "上传代码"按钮改为绿色 accent',
            '竞技模式金钱显示: 对方金钱改为整段红色 "对方: xxx" (原"对方"金色、"数字"红色)',
            '修复: 单人种植界面右上角登录状态未显示 (始终显示占位符) 的问题',
        ],
    },
    {
        version: '1.0.0',
        title: 'v1.0.0',
        items: [
            '## 新操作',
            'PlantRow / PlantCol: 消耗 3 能量按数组顺序种植整行/列, 自动跳过无法种植的格子',
            'Teleport: 传送到任意位置, 消耗 ceil(欧氏距离) 能量; 竞技模式仅限己方半场内',
            'NewDrone: 花费 4000 金钱在指定位置创建新无人机 (上限: 单人 2 / 竞技 3, 下一回合开始执行代码)',
            '## 平衡性调整',
            '回合上限: 单人/竞技模式默认回合数 300 → 500',
            '香菇: 成熟后按上右下左顺序分 4 回合各扩散 1 株; 需浇水; 总生长周期在种植时动态计算 (20 + 2 × 场上香菇总数, 越多长得越慢)',
            '紫云英: 成本 100 / 收获 120 / 160 周期, 生长中每回合加速周围作物',
            '西瓜: 成本 1000 / 收获 1800 / 100 周期; 移除沙地免疫 (沙地生长同样 ×1.5)',
            '行/列范围操作 (种植/收割/浇灌/拦截) 范围缩短为以施法点为中心的 3 格',
            'ChangeTile 能量消耗提升至 6',
            '新机制 沙漠化: 收获的格子相邻有沙地时转化为沙地 (仅蚕食土地)',
            '新机制 间作: 四方向 ≥2 个不同种类作物时, 收获收益 +20%',
            '## 大版本迁移',
            '排行榜: 按大版本分 Tab (V0.x 时代的排行榜已冻结保留), 前三名用奖牌 Emoji 标注',
            '多人竞技: 上传代码池已清空 (所有玩家恢复未上传状态)',
            '## 界面改进',
            '主菜单全新布局: logo 替换大标题, 单人/多人两个大按钮居中, 其余入口平铺下方, 返回菜单改为图标按钮',
            '"模拟竞技"入口移入多人竞技页面 ("上传出战代码"左侧)',
            '回放页面: 未选择回放时 "选择回放" 按钮居中醒目展示',
            '页面整体不再滚动: 长代码不再把整个页面撑出滚动条 (各面板内部自行滚动)',
            '"单人模式" 更名为 "单人种植" (代码与文档同步); 排行榜按钮移除王冠图标',
            '主菜单背景新增浅色动态发光',
            '主菜单 Logo 下方显示当前版本号 (灰色小字)',
            '修复: 返回菜单图标显示为裂图 (back.svg 此前为空文件, 已补充)',
            '修复: 按钮文字竖直居中 (中文/Emoji 混排时的基线偏移)',
            '修复: 首次点击"开始"编译期间 (远程拉取 esbuild) 禁用开始/步进按钮, 避免重复点击; 按钮显示"编译中…"',
            '回放界面: "播放"按钮绿色、"暂停"按钮红色 accent',
        ],
    },
    {
        version: '0.1.5',
        title: 'v0.1.5',
        items: [
            'MCP 新增 12 个后端 API 工具: 单人 (提交验证 / 验证状态 / 提交历史 / 排行榜 / 回放下载) 与竞技 (出战状态 / 上传代码 / 玩家列表 / 发起对战 / 观战房间 / 历史对局 / 回放下载)',
            'MCP 调用改进: 请求失败返回明确错误, 未登录时提示先完成 GitHub 登录流程',
        ],
    },
    {
        version: '0.1.4',
        title: 'v0.1.4',
        items: [
            'AI 接入: 新增 /llms.txt (全部游戏文档拼接, LLM 可直接抓取) 与 /api-docs (后端 API 文档)',
            'MCP 卡片: 改为"支持两种方式接入" (llms.txt / MCP), 均可点击复制',
            '加速: 新增 ×8 档位, 回合间延迟取 0.1s 与程序实际执行时间的最大值',
            '香菇描述更新: 成熟时向上下左右四格种下新的香菇',
        ],
    },
    {
        version: '0.1.3',
        title: 'v0.1.3',
        items: [
            '回放导出: 单人本地 (结束弹窗"保存回放") / 服务器验证 ("我的成绩"下载) / 竞技历史 (下载) 均可导出 JSON 回放文件',
            '回放导入: 回放界面新增"导入回放记录", 可载入本地回放文件播放; 主菜单新增"回放"入口',
            '回放播放增强: 复用游戏内事件管线, 支持移动动画 / 浇水收获拦截特效; 回合 0 显示初始状态',
            '模拟竞技: 支持 ×2 / ×4 加速',
        ],
    },
    {
        version: '0.1.2',
        title: 'v0.1.2',
        items: [
            '新作物: 水仙 (种在水池, 自动给周围缺水作物浇水, 带淡蓝特效) / 西瓜 / 紫云英 / 香菇',
            '新操作: ChangeTile (3 能量转换脚下地块为土地/水池/沙地, 需相邻同类型地块)',
            '数值同步: 小麦 (收获 120 / 30 周期)、南瓜 (收获 500)',
            '排行榜: 金色皇冠按钮, 自己的成绩高亮',
            '提交优化: 确认弹窗无关闭按钮, 提交后显示加载圈, 完成自动弹排行榜',
            '首次进入: 自动展开 API 手册并弹出更新日志',
            '水仙加强: 生长中改为每回合自动给邻格缺水作物浇水一次 (原为每 3 周期)',
            '取水优化: CollectWater 一次取满 5 格水 (原为每次 1 格)',
        ],
    },
    {
        version: '0.1.1',
        title: 'v0.1.1',
        items: [
            '能量机制: 新增 Charge / HarvestRow / HarvestCol / WaterRow / WaterCol / InterceptRow / InterceptCol 操作',
            '新地块沙地: 草莓/葡萄/南瓜可种植, 生长周期 ×1.5; 更新地图布局',
            '视觉效果: 浇水/收获/拦截/充能 0.2s 淡出特效',
            '对战修复: 对手 Move 坐标换算、重复开房间限制、观战列表过滤已结束对局',
            '提交按钮改金黄色并靠右, 提交前增加确认弹窗',
            '对方金钱以淡红色展示',
            '初始资金调整为 20',
        ],
    },
];

function versionOf(v: string): string {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? `${m[1]}.${m[2]}.${m[3]}` : '';
}

function isKnownVersion(stored: string): boolean {
    const s = versionOf(stored);
    const cur = versionOf(VERSION);
    return s !== '' && s === cur;
}

/** Show update log modal */
export function showUpdateLog(): void {
    const body = el('div', { class: 'update-log' });
    for (const entry of UPDATE_LOG) {
        // One card per release, with a version header and grouped change items.
        const card = el('section', { class: 'update-card' }, [
            el('header', { class: 'update-card-head' }, [
                el('span', { class: 'update-version', text: entry.title }),
                ...(entry.version === VERSION ? [el('span', { class: 'update-badge', text: '当前版本' })] : []),
            ]),
            el('div', { class: 'update-card-body' }, buildGroups(entry.items)),
        ]);
        body.append(card);
    }
    modal('更新日志', body);
}

/** Build group headings + item lists from a release's flat item array. */
function buildGroups(items: string[]): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    let list: HTMLElement | null = null;
    for (const item of items) {
        // Items starting with "## " act as group subheadings; a new list starts after each.
        if (item.startsWith('## ')) {
            nodes.push(el('div', { class: 'update-group', text: item.slice(3) }));
            list = el('ul', { class: 'update-items' });
            nodes.push(list);
        } else {
            if (!list) {
                list = el('ul', { class: 'update-items' });
                nodes.push(list);
            }
            list.append(el('li', { class: 'update-item', text: item }));
        }
    }
    return nodes;
}

/** Check version on page load (first visit auto-expands API manual, version change shows update log). */
export function checkVersionOnLoad(autoExpandManual: () => void): void {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(VERSION_KEY);
    } catch {
        // Silently skip when localStorage is unavailable (private mode, etc.)
    }
    if (stored === null) {
        // First visit: auto-expand right-hand API manual, also show update log
        autoExpandManual();
        showUpdateLog();
    } else if (!isKnownVersion(stored)) {
        // Older or unrecognized version: show update log
        showUpdateLog();
    }
    try {
        localStorage.setItem(VERSION_KEY, VERSION);
    } catch {
        // Ignore write failure
    }
}
