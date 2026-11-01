window.__ModuleLoader__.load({
	id: "@huashaoya/dsh-enhance",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;

		/*
		* DSH 增强插件 —— 浏览器半边。
		*
		* 文件按三层排布，往下读即可：
		*   1. 共享层：所有功能复用的样式、菜单行、侧栏读取与关闭工具；
		*   2. 功能层：一个功能一个 IIFE，各自持有自己的常量与文案；
		*   3. 注册层：FEATURES 列表 + 聚合 apply，逐条装上并互相隔离。
		*
		* 加新功能只改第 2 层与 FEATURES 一行，不动 package.json、不动 Host 行、
		* 不新增 Loader 入口。功能跑在各自的 ctx.inject 子 fiber 上，所以缺服务只
		* 停那一个功能，抛错也只影响自己。
		*/

		// ------------------------------------------------------------------
		// 1. 共享层
		// ------------------------------------------------------------------

		/**
		* 菜单行几何，抄自停靠框架自己的 `.menuItem`（padding / 字号 / 圆角 /
		* 悬停面）。行渲染在框架的菜单容器里，对齐它才像菜单的原生一行。只引用
		* `--dsw-alias-*` 主题令牌：令牌改名只会让外观退化，不会让行崩掉。
		*/
		const MENU_ITEM = {
			width: "100%",
			padding: "4px 7px",
			textAlign: "left",
			color: "var(--dsw-alias-label-primary)",
			fontSize: "calc(var(--dsh-content-font-size-secondary, 13px) - 1px)",
			background: "transparent",
			border: "none",
			borderRadius: "var(--dsw-radius-md)",
			cursor: "pointer"
		};

		/**
		* 跟随语言变化：订阅 locale 注册表的 revision。菜单可能开着时切语言，而
		* 语言字典也可能比首次渲染晚到，两种情况都要重画。三个函数参数稳定，不
		* 会触发多余订阅。
		* @param ctx - 拥有 locale 服务的上下文。
		*/
		const useLocaleRevision = (ctx) => React.useSyncExternalStore(
			(listener) => ctx.locale.subscribe(listener),
			() => ctx.locale.getSnapshot(),
			() => ctx.locale.getSnapshot()
		);

		/**
		* 一条菜单行。悬停面由服务端令牌提供，按下与点击交给调用方。
		* @param props - onClick 与子节点。
		* @returns 菜单里的一行按钮。
		*/
		function MenuRow(props) {
			const [hovered, setHovered] = React.useState(false);
			return h("button", {
				type: "button",
				role: "menuitem",
				"data-dsh-enhance": props.action,
				style: hovered ? {
					...MENU_ITEM,
					background: "var(--dsw-alias-interactive-bg-hover)"
				} : MENU_ITEM,
				onMouseEnter: () => setHovered(true),
				onMouseLeave: () => setHovered(false),
				onClick: props.onClick
			}, props.children);
		}

		/**
		* 注册一个功能自己的文案字典，并把清理接进插件生命周期。
		* @param ctx - 功能上下文。
		* @param ns - 功能独占的文案命名空间。
		* @param copy - 语言 id → 扁平字典。
		*/
		const registerCopy = (ctx, ns, copy) => {
			ctx.effect(() => {
				const disposers = Object.entries(copy).map(([locale, dict]) => ctx.locale.register(ns, locale, dict));
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, `dsh-enhance: ${ns} copy`);
		};

		/** 右侧面板控制器；没有这个服务时返回 undefined，功能自行放弃。 */
		const rightOf = (ctx) => ctx.sidebarRight;

		/**
		* 当前正在画的会话。命令类接口以它为作用域，而菜单项可能出现在别的
		* 会话残留的视图上，所以调用方仍应优先用 props.sessionId。
		* @param ctx - 拥有 sidebarRight 的上下文。
		* @returns 会话 id，或 undefined。
		*/
		const onScreenSession = (ctx) => {
			const mounted = rightOf(ctx)?.mounted;
			return mounted !== void 0 && typeof mounted.getSnapshot === "function" ? mounted.getSnapshot() : void 0;
		};

		/**
		* 列出一个会话当前开着的所有标签（停靠、分栏、浮出都在同一个 layout.tabs
		* 里，所以这里天然覆盖浮窗）。
		*
		* layout 是唯一真相，读的是已提交快照；`openTabs` 只在本窗口没 mint 过该
		* 会话 store（比如上次启动留下的标签）时兜底。
		* @param ctx - 拥有 sidebarRight 的上下文。
		* @param sessionId - 目标会话；undefined 时返回空列表。
		* @returns 标签 id 列表。
		*/
		const openTabIds = (ctx, sessionId) => {
			const right = rightOf(ctx);
			if (right === void 0 || sessionId === void 0) return [];
			try {
				return right.tabsIn(sessionId).map((tab) => tab.id);
			} catch (error) {
				// 该会话还没有 adopted surface，退回 inventory。
			}
			const inventory = right.openTabs;
			const snapshot = inventory !== void 0 && typeof inventory.getSnapshot === "function" ? inventory.getSnapshot() : [];
			return snapshot.filter((entry) => entry.sessionId === sessionId).map((entry) => entry.tabId);
		};

		/**
		* 通过控制器关一个标签，而不是直接改 store：这样该 kind 的 closeHandler
		* 会跑（终端 pty、编辑器脏缓冲的收尾都在里面），唯一停靠引导页的规则也
		* 由控制器把关。
		* @param ctx - 拥有 sidebarRight 的上下文。
		* @param sessionId - 标签所属会话。
		* @param tabId - 要关的标签。
		*/
		const closeOne = (ctx, sessionId, tabId) => {
			const right = rightOf(ctx);
			if (right === void 0) return;
			if (sessionId !== void 0 && typeof right.closeIn === "function") right.closeIn(sessionId, tabId);
			else right.close(tabId);
		};

		/**
		* 批量关闭：先关菜单再动手，然后逐个关，单点失败不打断整批。
		*
		* 整批操作在控制器里记成一条 history，所以是一次 undo 而不是 N 次；关掉
		* 最后一个停靠标签时，控制器自己的规则会让侧栏收起。
		* @param dismiss - 框架要求动作先关菜单。
		* @param args - 上下文、会话、要关的标签。
		*/
		const closeMany = (dismiss, ctx, sessionId, tabIds) => {
			dismiss();
			for (const tabId of tabIds) {
				try {
					closeOne(ctx, sessionId, tabId);
				} catch (error) {
					// 某个 kind 的清理逻辑拒绝关闭（终端不肯停、缓冲不肯存）时，控制器
					// 会保留那个标签；其余继续关，原因留在控制台里。
					console.error(`dsh-enhance: failed to close tab "${tabId}"`, error);
				}
			}
		};

		// ------------------------------------------------------------------
		// 2. 功能层
		// ------------------------------------------------------------------

		/**
		* 功能一：标签右键菜单「全部关闭」。
		*
		* 挂在官方扩展位 `sidebar.right.tab.menu.item`（一个 list 槽，只增不减），
		* 框架把它排在原生「关闭」之后。少于两个标签时不渲染：单个标签用原生
		* 「关闭」即可，多出来的动作没有语义。
		*/
		const featureCloseAllTabs = (() => {
			const SLOT = "sidebar.right.tab.menu.item";
			const NS = "enhance.closeAllTabs";

			/**
			* @param ctx - 功能上下文（已有 slots / locale / sidebarRight）。
			* @returns 菜单行组件工厂。
			*/
			const createItem = (ctx) => {
				const t = ctx.locale.bind(NS);

				/**
				* @param props - 框架给的 tab（哪个标签的菜单）与 dismiss（关菜单）。
				* @returns 菜单行，或没有标签可关时的 null。
				*/
				return function CloseAllTabs(props) {
					useLocaleRevision(ctx);
					const sessionId = props.sessionId ?? onScreenSession(ctx);
					const tabIds = openTabIds(ctx, sessionId);
					// Hook 都在这里之前，所以这行可以随标签数反复出现/消失。
					if (tabIds.length < 2) return null;
					return h(MenuRow, {
						action: "close-all-tabs",
						onClick: () => closeMany(props.dismiss, ctx, sessionId, tabIds)
					}, t("label"));
				};
			};

			return {
				id: "close-all-tabs",
				inject: ["slots", "locale", "sidebarRight"],
				apply(ctx) {
					registerCopy(ctx, NS, {
						zh: { label: "全部关闭" },
						en: { label: "Close All" }
					});
					ctx.slots.inject(SLOT, () => ctx.slots.register({
						name: SLOT,
						id: "close-all-tabs",
						order: 10
					}, createItem(ctx)));
				}
			};
		})();

		/**
		* 全部功能。加一条就多一个功能；顺序只影响 install 顺序，不影响界面。
		*/
		const FEATURES = [
			featureCloseAllTabs
		];

		// ------------------------------------------------------------------
		// 3. 注册层
		// ------------------------------------------------------------------

		/**
		* 逐条装功能。
		*
		* 每个功能跑在自己的 `ctx.inject(feature.inject, ...)` 子 fiber 上：缺哪
		* 个服务，只静默跳过那一个功能；功能内部抛错也只记日志，不会连累其他
		* 功能，更不会把整个 bundle 打成 FAILED。
		* @param ctx - 浏览器根上下文。
		*/
		function apply(ctx) {
			for (const feature of FEATURES) {
				ctx.inject(feature.inject, (sub) => {
					try {
						feature.apply(sub);
					} catch (error) {
						console.error(`dsh-enhance: feature "${feature.id}" failed to install`, error);
					}
				});
			}
		}

		return {
			inject: [],
			apply
		};
	}
});
