<div align="center">
  <img src="https://cdn.jsdelivr.net/gh/viarotel/resources@latest/logos/escrcpy.png" alt="Escrcpy" width="96">

# Escrcpy Docs

**把 Android 投屏、干净截图和操作手册标注放在一个工具里。**

基于 [Escrcpy](https://github.com/viarotel-org/escrcpy) 改造 · Apache-2.0
</div>

## 我为什么做这个 fork

我经常要给手机端系统写操作手册。以前的流程很碎：手机截图、传到电脑、投屏、再开 PixPin 或 ShareX 做框选、箭头、编号，做完还要担心状态栏里有没有通知、时间、电量、账号之类不适合出现在文档里的内容。

所以我在 Escrcpy 上加了一套 **Documentation Mode（文档模式）**。我的目标不是再做一个大而全的截图软件，而是把最常用的流程压缩成一条顺手的链路：

```text
连接 Android 设备
      ↓
开启文档模式
      ↓
清理状态栏 / Demo Mode
      ↓
F8 原始截图
或 Shift+F8 截图并标注
      ↓
矩形 / 箭头 / 文字 / 步骤编号
聚光灯 / 放大镜 / 马赛克 / 无痕修复
      ↓
保存 JSON 工程
      ↓
导出 PNG
      ↓
退出程序时自动恢复手机状态
```

我希望它更像一个专门给 **操作手册、使用指引、培训材料、产品说明** 准备的手机截图工作台。

## 文档模式

在设备控制栏里可以直接开启或关闭文档模式。

开启后，程序会先记录设备原来的 Demo Mode 设置，再尝试使用 Android System UI Demo Mode 统一状态栏，例如固定时间、电量和网络状态，并隐藏通知图标。

关闭文档模式或退出 Escrcpy Docs 时，程序会恢复进入前的状态。上一次如果异常退出，下一次启动也会尝试恢复遗留状态。

> Android 厂商会定制 SystemUI，因此 Demo Mode 的实际效果取决于设备 ROM。标准 Android / AOSP 命令已经完整接入，但部分厂商可能只响应其中一部分。

## 截图

我保留了 Escrcpy 原有截图，同时增加了专门用于文档的截图入口：

- **F8**：保存手机原始 PNG
- **Shift + F8**：保存原始 PNG，并直接进入标注编辑器
- 设备控制栏也有对应按钮

截图走 ADB 原始画面，不是截取电脑上的投屏窗口，所以不会因为 scrcpy 窗口缩放而降低截图分辨率。

普通截图原先存在“PNG 内容使用 `.jpg` 扩展名”的问题，这个 fork 里也统一改成了真正的 `.png`。

## 标注编辑器

标注编辑器使用 [Fabric.js](https://github.com/fabricjs/fabric.js) 实现。我比较喜欢 PixPin 那种紧凑、工具就在手边、基本不用学习的感觉，所以这里也尽量保持工具栏简单直接。

目前包括：

- 选择、移动、缩放、旋转
- 矩形框
- 箭头
- 文字
- 自动步骤编号
- 画笔
- 聚光灯 / 关灯
- 放大镜
- 马赛克
- 无痕修复
- Android UI 智能框选
- 撤销 / 重做
- 颜色、线宽等常用参数调整

编辑器快捷键：

| 快捷键 | 功能 |
|---|---|
| `V` | 选择 |
| `R` | 矩形 |
| `A` | 箭头 |
| `T` | 文字 |
| `N` | 步骤编号 |
| `L` | 聚光灯 |
| `G` | 放大镜 |
| `M` | 马赛克 |
| `H` | 无痕修复 |
| `P` | 画笔 |
| `Ctrl + Z` | 撤销 |
| `Ctrl + Y` | 重做 |
| `Ctrl + S` | 保存工程 |
| `Delete` | 删除选中对象 |
| `Esc` | 回到选择工具 |

步骤编号会自动递增，右键步骤编号工具可以从 `1` 重新开始。

## 无痕修复

我不想为了操作手册截图再塞一个大型 AI 图片模型进来，所以这里做的是一个偏手机 UI 场景的轻量修复工具。

圈住不想保留的区域后，它会从原图周围寻找更适合的背景：

- 背景比较纯时，用邻近背景颜色进行填充
- 背景有纹理时，从上下左右选择相对平滑的邻近区域作为补片
- 边缘做羽化，减少明显拼接感

它比较适合处理通知角标、悬浮按钮、临时提示、账号信息附近的简单背景等。复杂照片背景不能替代专业的内容感知修复，但对于手机界面通常已经很实用。

而且它仍然只是一个**可撤销、可删除的标注图层**，不会修改原始截图。

## 智能框选

智能框选不是 OCR，也不需要云端模型。

程序会读取 Android `uiautomator` 提供的界面层级和控件 bounds。鼠标移动到按钮、输入框、菜单等区域时，会尽量吸附到对应 UI 边界，点击后直接生成框选。

这在传统 Android View 界面上效果比较好；某些 WebView、游戏、Canvas 或部分 Compose 页面可能无法提供完整节点，这时普通矩形工具仍然可以直接使用。

## 原图永远保留

这是我最在意的一点。

每次文档会话会生成独立目录：

```text
Documentation/
└─ 2026-08-13_132000_Xiaomi 17 Ultra/
   ├─ original/
   │  ├─ 001.png
   │  └─ 002.png
   ├─ project/
   │  ├─ 001.json
   │  └─ 002.json
   └─ output/
      ├─ 001.png
      └─ 002.png
```

- `original/`：手机原始截图，永不覆盖
- `project/`：Fabric 标注工程，可以以后重新打开继续修改
- `output/`：最终导出的标注 PNG

所以即使第二天才发现箭头画错、步骤编号要换、文字要改，也不用重新截图。

## 安装与运行

这个 fork 的桌面程序名称是 **Escrcpy Docs**，使用独立的应用 ID 和更新缓存，不会覆盖原版 Escrcpy。

发布包会提供 Windows 安装版和便携版。Android 端仍然需要启用 USB 调试或无线调试。

开发环境：

```bash
corepack enable
pnpm install
pnpm dev
```

构建 Windows：

```bash
pnpm build:win
```

项目使用 Node.js 24 / pnpm 10.x 进行 CI 验证。

## 和 ShareX / PixPin 的关系

我很喜欢 ShareX 的标注思路，也很喜欢 PixPin 在中文 Windows 环境里那种轻量、直接的使用感，所以这个编辑器会参考它们在交互和功能取舍上的经验。

**这里没有复制 ShareX 的 GPL 源代码。** ShareX 只作为产品和实现思路的参考；标注编辑器本身基于 Fabric.js 和本项目自己的实现，以避免许可证混用问题。

PixPin 是商业软件，我只参考自己的实际使用体验，不使用它的代码或资源。

## 开源与上游

这个仓库是 [viarotel-org/escrcpy](https://github.com/viarotel-org/escrcpy) 的 fork，继续遵循上游的 Apache-2.0 License。

我会尽量把文档模式保持成相对独立的模块，减少对 Escrcpy 核心控制、投屏和 ADB 逻辑的侵入，这样以后同步上游版本会容易一些。

更完整的第三方说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 感谢

这个项目首先建立在大量优秀开源项目和社区工作的基础上，感谢：

- [Escrcpy](https://github.com/viarotel-org/escrcpy) 以及所有贡献者 —— 这个 fork 的完整基础
- [scrcpy](https://github.com/Genymobile/scrcpy) 以及所有贡献者 —— Android 投屏与控制的核心
- [Fabric.js](https://github.com/fabricjs/fabric.js) 以及所有贡献者 —— 标注编辑器的 Canvas 基础
- [adbkit](https://github.com/DeviceFarmer/adbkit)、Electron、Vue、UnoCSS 等项目和贡献者
- [ShareX](https://github.com/ShareX/ShareX) —— 给了我很多截图标注工作流上的启发
- PixPin —— 很多中文桌面截图工具的交互细节值得学习

开发这个 fork 的过程中，我也使用了 **OpenAI Codex** 帮我做源码梳理、实现、重构和持续构建验证，感谢 OpenAI。

最后也感谢 **Tibo** 提供的重置额度支持，让这次折腾可以更顺畅地推进下去。

## License

Apache License 2.0。请同时保留并遵守上游项目及各第三方依赖各自的许可证和版权声明。
