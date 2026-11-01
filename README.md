# dsh-enhance · DSH 增强插件

A single DeepSeek Harness plugin bundle that ships many small UI extensions. One package, one entry, one switch — instead of one package per tiny feature.

一个插件包，装多个小扩展。目标：**一份代码、一个入口、一处启停**。

> 面向使用者：直接跳到 [安装](#安装)。面向开发者：跳到 [加一个新功能](#加一个新功能)。

---

## 功能

| 功能 | 位置 | 说明 |
| --- | --- | --- |
| 全部关闭 / Close All | 右侧面板标签页右键菜单 | 一次关掉当前会话的所有标签（停靠 / 分栏 / 浮出都算）。**标签少于 2 个时该行不出现** |

关掉最后一个停靠标签时，侧栏按内置规则收起，下次展开重新播默认引导页——和手动点最后一个 × 的行为一致。整批关闭在侧栏的历史里记成一步，可一次撤销。

---

## 安装

前提：已装 `dsh`（`npm i -g @deepseek-ai/dsh`）并能跑 `dsh web`。

### 从 npm

```bash
dsh plugin --profile web add @huashaoya/dsh-enhance
```

### 从 GitHub

```bash
dsh plugin --profile web add github:huashaoya/dsh-enhance
```

### 从本地目录（离线 / 自己改过）

解压或 clone 到任意绝对路径，然后：

```bash
dsh plugin --profile web add D:/plugins/dsh-enhance
```

**装完必须刷新浏览器页面。** 插件的模块图在页面启动时组好，新装一个包等于图里多一条入口，不重载就拿不到。

### 在图形界面里装

也可以不敲命令：在 DSH 的 **Settings → Plugins** 里安装，效果相同。

---

## 使用

在右侧面板（文件预览 / 浏览器 / 终端）的任意标签上**右键**，菜单里会出现「全部关闭」。点它，当前会话的标签一次关完。

只有一个标签时这一行不出现——单个标签用菜单自带的「关闭」就够。

---

## 停用与卸载

```bash
# 停用（保留文件）
dsh plugin --profile web remove @huashaoya/dsh-enhance

# 或只想去掉某个功能：改 client.js 里的 FEATURES，见下
```

图形界面：**Settings → Plugins** → 「DSH 增强 / DSH Enhance」关掉即可。

---

## 加一个新功能

所有功能都在 `client.js` 一个文件里，三层排布：

```
1. 共享层   MENU_ITEM 样式 / MenuRow 菜单行 / useLocaleRevision /
            registerCopy / openTabIds / closeOne / closeMany
2. 功能层   一个功能一个 IIFE，自己持有 SLOT、NS、文案、组件
3. 注册层   FEATURES 数组 + apply() 聚合
```

加功能的完整流程：在第 2 层写一个 IIFE，往 `FEATURES` 加一行。**不要**动 `package.json`、`cordis.patch.yml`、`index.js`。

```js
const featureMyThing = (() => {
  const SLOT = "sidebar.right.tab.menu.item";  // 换成你要挂的槽位
  const NS = "enhance.myThing";                // 独占文案命名空间

  const createItem = (ctx) => {
    const t = ctx.locale.bind(NS);
    return function MyThing(props) {
      useLocaleRevision(ctx);
      return h(MenuRow, {
        action: "my-thing",
        onClick: () => { props.dismiss(); /* 干活 */ }
      }, t("label"));
    };
  };

  return {
    id: "my-thing",
    inject: ["slots", "locale"],   // 按需加 sidebarRight 等服务
    apply(ctx) {
      registerCopy(ctx, NS, { zh: { label: "我的功能" }, en: { label: "My Thing" } });
      ctx.slots.inject(SLOT, () => ctx.slots.register(
        { name: SLOT, id: "my-thing", order: 20 },
        createItem(ctx)
      ));
    }
  };
})();
```

然后：

```js
const FEATURES = [
  featureCloseAllTabs,
  featureMyThing,        // ← 加这一行
];
```

### 三条约定

1. **`id` 全局唯一**，槽位内也一样；重复的 id 会顶掉别的项。
2. **文案走 `registerCopy` + `bind`**，不要硬编码中文——界面语言可切。
3. **数据从服务读，不读 DOM**；动作走宿主自己的命令通路（如 `ctx.sidebarRight.closeIn`），不直接改 store。

### 为什么每个功能单独包一层 `ctx.inject`

聚合 `apply()` 对每个功能做：

```js
ctx.inject(feature.inject, (sub) => { feature.apply(sub) })
```

每个功能跑在**自己的 cordis 子 fiber** 上，因此：

- 声明的服务缺失 → 只有这个功能不激活，其余照常；
- 功能内部抛错 → 只记一条 `console.error`，不会把整个 bundle 打成 FAILED；
- 卸载插件 = 子 fiber 全部 dispose = 槽位注册、文案字典、监听器自动撤销。

### 怎么找槽位

不要猜槽位名。运行时查：

```js
cordis_inspect_query({ platform: "client", provider: "Slots", method: "listSubTree", input: {} })
```

返回整棵槽位树：`kind`（`single` 会顶掉内置 / `list` 只增 / `keyed` 按 key 分派 / `chain` 可改道）、`purpose`、`ownerProps`、注册要求。

---

## 文件结构

```
dsh-enhance/
├── client.js          ← 所有功能都在这里（唯一需要改的文件）
├── index.js           ← Host 半边，目前为空；将来放工具 / 服务
├── cordis.patch.yml   ← Loader 入口（整个插件只占一行）
├── package.json       ← bundle 声明 + 浏览器 bundle 声明
├── locale/{zh,en}.json ← 插件在设置页里显示的名字和描述
├── icon.svg
└── README.md
```

**改名要改三处**：`package.json` 的 `name`、`cordis.patch.yml` 里那一行的 `name`、`client.js` 第一行的 `id`。三者对不上，插件会加载但拿不到自己的 client bundle。

---

## 发布到 npm

```bash
npm publish --access public
```

注意 `files` 里必须包含 `client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`，否则装完是坏的。用 `npm pack --dry-run` 核对实际打包清单。

---

## 已知限制

- **必须刷新页面**才生效（模块图在 boot 时组好）。
- `immediately: true` 意味着页面启动阶段就要注册；因此 `apply` 绝不能抛错——现在的 try/catch 保证了这一点。
- 行内 `style` 而非 `<style>` 标签注入：卸载时不会留下幽灵样式，代价是不能用媒体查询和伪类。
- 样式只引用 `--dsw-alias-*` 主题令牌：令牌改名只会让外观退化，不会让组件崩掉。

---

## License

MIT
