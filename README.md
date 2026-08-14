<div align="center">

# GuidePix

**把手机上的一次操作，直接变成清晰、可修改、可发布的步骤指南。**

Capture → Annotate → Compose

基于 [Escrcpy](https://github.com/viarotel-org/escrcpy) 改造 · Apache-2.0

</div>

## 我为什么做 GuidePix

我经常要给手机端系统做操作手册。以前这件事看起来只是“截几张图”，真正做起来却很碎：投屏操作、手机截图、传到电脑、清理状态栏、再用 PixPin 或 ShareX 画框和箭头，最后还要把几张图重新排版成一份能看的指南。

GuidePix 想解决的不是“怎么再造一个截图工具”，而是把这条流程变成一个完整工作台：

```text
连接 Android 手机
      ↓
开启文档模式（Demo Mode + 勿扰）
      ↓
连续 F8 截完整个操作流程
      ↓
故事板整理顺序 / Caption / 步骤变体
      ↓
连续标注
      ↓
矩形 / 箭头 / 文字 / 步骤编号
聚光灯 / 放大镜 / 马赛克 / 无痕修复
      ↓
纵向长图 / 两列步骤 / 前后对比 / 同图双步骤
      ↓
导出最终 PNG 指南
```

我希望它适合真正需要长期做 **操作手册、培训材料、产品说明、故障指引、App 使用教程** 的人，而不是只适合偶尔截一张图。

## 三个工作阶段

### Capture · 连续截图

做指南时，我更喜欢先把完整流程走完，而不是截一张就停下来标一张。

所以 GuidePix 默认推荐 **Capture First, Edit Later**：

- `F8`：直接触发手机自己的系统截图，并把原图拉回电脑
- `Shift + F8`：截图后立即进入标注
- 同一次文档模式里的截图自动归到同一个 Session
- `001 / 002 / 003 ...` 自动连续编号
- 故事板里可以拖动重新排序
- 每一张都可以填写步骤说明 Caption

对于已经 Root、并使用兼容的安全截图模块的设备，GuidePix 优先走手机 SystemUI 截图路径，让截图行为尽量和“人在手机上截图”保持一致。手机没有生成系统截图时，才回退到原始 ADB `screencap`。

### Annotate · 连续标注

截图结束后，可以一次选择多张图进入连续标注模式。

保存当前图以后直接切到上一张 / 下一张，不需要每次关闭编辑器再重新打开。步骤编号支持：

- 全局连续编号：第一张 ①、第二张 ②、第三张 ③……
- 每张图片从 1 开始
- 手动编号

标注器使用 [Fabric.js](https://github.com/fabricjs/fabric.js)，目前包括：

- 选择、移动、缩放、旋转
- 矩形框
- 箭头
- 文字
- 自动步骤编号
- 多区域聚光灯
- 放大镜
- 马赛克
- 无痕修复
- 画笔
- Android UI 智能框选
- 撤销 / 重做
- 颜色、线宽、遮罩透明度等常用参数

多个聚光区域共用**同一层遮罩**，不会因为画第二个、第三个聚光灯而把整张图越叠越黑。

### Compose · 合集

标注完不需要再打开其他排版软件。GuidePix 自带四种针对操作指南的合集模板：

- **纵向长图**：适合飞书、微信、Wiki、知识库
- **两列步骤**：适合 Word、PPT、桌面阅读
- **前后对比**：适合设置修改前后、故障处理前后
- **同图双步骤**：同一张原图的两个标注版本左右展示

合集只是最终输出，不会修改原图或工程。

## 同一截图可以有多个“步骤版本”

同一个手机页面有时要连续讲两个动作。如果把 ①②③ 全堆在一张图上会太乱，我希望能直接把同一张原图做成多个版本：

```text
original/
└─ 001.png

project/
├─ 001.json
├─ 001-A.json
└─ 001-B.json

output/
├─ 001.png
├─ 001-A.png
└─ 001-B.png
```

`001-A` 和 `001-B` 都引用同一张 `001.png`，只是标注不同，所以不会为了做两个步骤复制一堆原图。

这个能力也正好用于“同图双步骤”合集。

## 原图、工程和成品分开保存

我很在意可回退，所以 GuidePix 不会把标注直接焊死到原始截图上。

每次会话会维护自己的 `session.json`，并保存：

```text
Session/
├─ session.json
├─ original/
│  ├─ 001.png
│  └─ 002.png
├─ project/
│  ├─ 001.json
│  └─ 002.json
├─ output/
│  ├─ 001.png
│  └─ 002.png
└─ compose/
   └─ 我的操作指南-vertical.png
```

- `original/`：手机原始截图，永不覆盖
- `project/`：可继续修改的 Fabric 标注工程
- `output/`：单张标注后的成品 PNG
- `compose/`：最终合集图
- `session.json`：顺序、Caption、步骤模式、变体等会话信息

所以第二天发现箭头画错了、某一步要重新突出、步骤顺序要调整，都不需要重新截图。

## 文档模式

GuidePix 会把做手册时最容易穿帮的手机状态一起管理。

开启文档模式后会：

- 记录进入前的 Android Demo Mode 设置
- 尝试固定时间、电量、网络等状态栏内容
- 隐藏通知图标
- 临时进入勿扰，避免通知突然弹进截图

关闭文档模式或退出 GuidePix 时，会尽量恢复进入前的状态。异常退出后再次启动，也会尝试恢复遗留状态。

Android 厂商会定制 SystemUI，所以 Demo Mode 最终能控制哪些元素取决于 ROM；这部分我不会假装所有手机都完全一致。

## 无痕修复

我最终没有加入 OCR，也没有为了修一块 UI 背景塞一个大型 AI 模型。

“无痕修复”更贴近操作手册的实际需求：圈掉通知角标、悬浮按钮、临时提示、简单账号区域后，根据周围背景做颜色或邻近补片修复，并做边缘羽化。

它不是万能的内容感知填充，但对于大量纯色、卡片、渐变较弱的手机 UI 很实用，而且修复仍然是一个可撤销、可删除的工程对象，原图不动。

## 智能框选

智能框选不依赖 OCR。

GuidePix 读取 Android `uiautomator` 提供的 UI hierarchy 和控件 bounds，鼠标移动到按钮、输入框、菜单等区域时尽量自动吸附边界。

传统 Android View 页面通常效果很好；WebView、Canvas、游戏或部分 Compose 页面如果拿不到完整节点，就直接使用普通矩形，不影响基础标注。

## UI 设计

GuidePix 仍然保留 Escrcpy 的多设备能力，但主界面不再按“同时管理几十台手机”的密度设计。

我的常见场景就是 1 台手机，偶尔 2～3 台，所以首页改成了更大的设备卡片和几个真正高频的大按钮：

- 打开投屏
- 开启文档模式
- 截图
- 截图并标注
- 打开 GuidePix 工作台

Home、返回、旋转、音量、文件管理、终端、安装 APK 等原能力都还在，只是收进“更多手机工具”，不再和做指南的主流程抢位置。

## 快捷键

全局：

| 快捷键 | 功能 |
|---|---|
| `F8` | 手机原图截图 |
| `Shift + F8` | 截图并标注 |

标注器：

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

## 安装与开发

Windows 发布文件尽量保持简单：

```text
GuidePix-Portable-x64.exe
GuidePix-Setup-x64.exe
GuidePix-x64.zip
```

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

当前 CI 使用 Node.js 24 / pnpm 10.x。

## 未来跨平台

GuidePix 现在优先把 Windows + Android 手机这条链做好，但我会尽量把核心保持成可迁移结构：

- Session / JSON 工程
- Fabric.js 标注器
- Storyboard
- Variant
- Composer

这些都应该尽量和 Electron / ADB 解耦。

未来 Android 版可以直接在手机上完成截图、标注和长图指南；iOS 版至少可以共享工程、标注、步骤管理和合集生成。设备控制和系统截图属于各个平台自己的 Adapter，不应该污染核心工程格式。

## ShareX / PixPin

我很喜欢 ShareX 的标注思路，也很喜欢 PixPin 在中文 Windows 环境里那种轻量、直接、工具就在手边的感觉。

GuidePix 会学习它们的交互取舍，但**没有复制 ShareX 的 GPL 源代码**。标注器基于 Fabric.js 和本项目自己的实现，以避免许可证混用。

PixPin 是商业软件，我只参考自己的使用体验，不使用它的代码或资源。

## 开源与上游

这个仓库源自 [viarotel-org/escrcpy](https://github.com/viarotel-org/escrcpy)，继续遵循上游的 Apache License 2.0。

我会尽量把 GuidePix 的会话、标注和合集能力放在相对独立的模块里，同时保留 Escrcpy 原来的投屏、ADB 和设备工具，这样未来仍然有机会同步上游改进。

第三方依赖说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 感谢

GuidePix 站在很多优秀项目的肩膀上，感谢：

- [Escrcpy](https://github.com/viarotel-org/escrcpy) 和所有贡献者 —— 整个桌面设备管理基础
- [scrcpy](https://github.com/Genymobile/scrcpy) 和所有贡献者 —— Android 投屏与控制核心
- [Fabric.js](https://github.com/fabricjs/fabric.js) 和所有贡献者 —— 标注编辑器基础
- adbkit、Electron、Vue、UnoCSS 等项目和贡献者
- [ShareX](https://github.com/ShareX/ShareX) —— 给了我很多截图标注工作流上的启发
- PixPin —— 很多中文桌面截图工具的交互细节值得学习

开发和重构这个项目的过程中，我使用了 **OpenAI Codex** 帮我做源码梳理、实现、重构和持续构建验证，感谢 OpenAI。

最后也感谢 **Tibo 的重置额度**，让我能把这次折腾持续推进下去。

## License

Apache License 2.0。使用和分发时请同时保留并遵守上游项目以及各第三方依赖各自的许可证和版权声明。
