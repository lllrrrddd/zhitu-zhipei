// SPDX-License-Identifier: Apache-2.0
const common = {
  "common.action.cancel": "取消",
  "common.action.save": "保存",
  "common.action.confirm": "确认",
  "common.action.delete": "删除",
  "common.action.close": "关闭",
  "common.action.back": "返回",
  "common.action.refresh": "刷新",
  "common.action.discard": "放弃修改",
  "common.action.keep-editing": "继续编辑",
  "common.action.batchSelect": "批量选择",
  "common.action.stop": "停止",
  "common.retry": "重试",
  "common.errorBoundary.title.moduleLoad": "页面代码没能加载完整",
  "common.errorBoundary.title.generic": "页面暂时无法显示",
  "common.errorBoundary.body.moduleLoad":
    "这通常是页面代码没取到（网络抖动、前端开发服务器刚重启，或它缓存了已改名/已移动的文件）。先点「重试」——它会重新取一次；若仍失败，再刷新或重启前端开发服务器（关掉窗口后重新运行 start.cmd）。",
  "common.errorBoundary.body.generic": "界面运行时发生异常，请刷新后再试。",
  "common.errorBoundary.reason": "原因：{message}",
  "common.required": "必填",
  "common.placeholder.select": "请选择",

  // ── 通用交互组件（批量条 / 退出应用 / 拖放 / 加载 / 详情 / 行操作 / 折叠） ──
  /** 退出按钮与确认框的确认动作（`ExitAppButton`）。 */
  "common.action.exit": "退出",
  "common.action.more": "更多操作",
  /** 批量操作条的无障碍名（`BatchActionBar`）。 */
  "common.batchBar.aria": "批量操作",
  /** 批量操作条的已选计数。 */
  "common.batchBar.selected": "已选 {count} 项",
  /** 卡片网格类列表的「全选本页」：勾选框文字、title 与无障碍名共用一条。 */
  "common.batchBar.selectPage": "全选本页",
  /** 退出批量选择。 */
  "common.batchBar.exit": "退出选择",
  /** 批量删除按钮（`BatchDeleteButton`）。 */
  "common.batchBar.deleteSelected": "删除所选",
  /** 退出应用的二次确认标题。 */
  "common.exitApp.title": "关闭职途智配？",
  /** 桌面壳形态的确认正文：退出后只能从桌面快捷方式重新启动。 */
  "common.exitApp.confirm.desktop": [
    "这是本机应用：「关闭」会停掉后台服务，窗口随之退出。",
    "已保存的资料、简历和岗位都不会丢；下次双击桌面图标即可继续。",
  ].join("\n"),
  /** 浏览器形态的确认正文：讲清哪些能力会立刻不可用，以及怎么再打开。 */
  "common.exitApp.confirm.browser": [
    "职途智配跑在你这台电脑上：「关闭」会停掉后台服务，页面随即失效（刷新也打不开）。",
    "已保存的资料、简历和岗位都不会丢；下次双击 start.cmd 就能重新启动。",
    "只想关掉网页、让服务继续跑？直接关这个标签页就好，不用点这里。",
  ].join("\n"),
  /** 退出完成后的结果页标题。 */
  "common.exitApp.exited.title": "职途智配已关闭",
  /** 桌面壳形态的结果页正文。 */
  "common.exitApp.exited.desktop":
    "前端、后端与桌面壳进程都已停止。再次使用请从桌面快捷方式启动职途智配。",
  /** 浏览器形态的结果页正文。 */
  "common.exitApp.exited.browser":
    "前端与后端进程都已停止，现在可以关闭这个标签页。要再次使用，请在项目目录运行 start.cmd。",
  /** 退出按钮的 Tooltip：说明它会停掉什么。 */
  "common.exitApp.tooltip": "关闭应用（停止本机的前后端服务）",
  /** 退出按钮的无障碍名。 */
  "common.exitApp.aria": "关闭应用",
  /** 后端没有返回说明时的退出中提示。 */
  "common.exitApp.exiting": "应用正在退出",
  /** 退出失败（没有更具体的原因）。 */
  "common.exitApp.failed": "退出失败，也可以直接关闭后端窗口",
  /** 退出失败（带接口错误信息）。 */
  "common.exitApp.failedWithReason": "{message}（也可以直接关闭后端窗口）",
  /** 拖拽覆盖层的默认提示（`FileDropZone`）。 */
  "common.fileDropZone.hint": "松开即可导入",
  /** 加载态的无障碍名（`LoadingBlock` / `PageSkeleton` 共用）。 */
  "common.loading.content": "正在加载内容",
  /** 输入达到上限时的一行提示（`MaxLengthHint`）。 */
  "common.maxLength.reached": "已达 {count} 字上限",
  /** 详情抽屉里没有可展示字段时的占位（`RecordDetail`）。 */
  "common.recordDetail.empty": "这条记录没有更多内容",
  /** 行操作「更多」按钮的无障碍名（`RowActions`）。 */
  "common.rowActions.more": "更多操作",
  /** 折叠列表展开全部（`useCollapsedList`）。 */
  "common.collapsedList.expand": "显示全部 {count} 条",
  /** 折叠列表收起。 */
  "common.collapsedList.collapse": "收起列表",
  /** 软删除二次确认的后果段（行操作与批量删除共用的唯一出处）：进回收站，之后可恢复。 */
  "common.note.trashRecovery": "会移入回收站，之后可以在「回收站」里恢复。",
  /** 硬删除二次确认的后果段（与上一条成对）：不进回收站，也没有恢复入口。 */
  "common.note.hardDelete": "会直接删除，不进「回收站」，也无法恢复。",
  "auth.logout": "退出登录",
  "auth.login.tabLogin": "登录",
  "auth.login.tabRegister": "注册",
  "auth.login.name": "称呼",
  "auth.login.namePlaceholder": "选填",
  "auth.login.invite": "邀请码",
  "auth.login.invitePlaceholder": "8 位邀请码",
  "auth.login.email": "邮箱或手机号",
  "auth.login.password": "密码",
  "auth.login.passwordHint": "至少 8 位",
  "auth.login.submitLogin": "登录",
  "auth.login.submitRegister": "注册并进入",
  "auth.login.checking": "正在确认登录状态…",
  "auth.login.brandTag": "简历到 offer",
  "auth.login.hint": "注册即可使用。每个账号的简历与岗位数据各自独立，互不可见。",
  "auth.login.requiredEmail": "请填写邮箱或手机号",
  "auth.login.requiredPassword": "请填写密码",
  "auth.login.failed": "操作失败",
  "auth.login.tabReset": "忘记密码",
  "auth.login.resetCode": "重置码",
  "auth.login.resetCodePlaceholder": "8 位数字重置码",
  "auth.login.newPassword": "新密码",
  "auth.login.submitReset": "重设密码",
  "auth.login.resetDone": "密码已重设，请用新密码登录。",
  "auth.brand.title": "把简历变成面试机会",
  "auth.brand.point1": "简历诊断：结构、措辞、量化是否经得起追问",
  "auth.brand.point2": "岗位匹配：按你的经历找对口岗位，而不是海投",
  "auth.brand.point3": "投递跟进：一次投递一条记录，进度不再靠记忆",
  "auth.brand.footnote": "每个账号的数据各自独立，互不可见",
  "auth.login.requiredCode": "请填写重置码",
  "auth.login.serverError": "服务暂时不可用，请稍后重试",
} as const;

export default common;
