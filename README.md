<div align="center">

# GuidePix

**把手机上的一次操作，直接变成清晰、可修改、可发布的步骤指南。**

Capture → Annotate → Compose

基于 [Escrcpy](https://github.com/viarotel-org/escrcpy) 改造 · Apache-2.0

</div>

## 我为什么做 GuidePix

我经常要给手机端系统做操作手册。以前这件事看起来只是“截几张图”，真正做起来却很碎：投屏操作、手机截图、传到电脑、清理状态栏、再用 PixPin 或 ShareX 画框和箭头，最后还要重新排版。

GuidePix 想解决的不是“再造一个截图工具”，而是把整条流程收进一个工作台：

```text
连接 Android 手机
      ↓
开启文档模式（Demo Mode + 勿扰）
      ↓
手机连续截图
      ↓
一次同步到电脑
      ↓
故事板整理顺序 / Caption / 步骤变体
      ↓
连续标注
      ↓
纵向长图 / 两列步骤 / 前后对比 / 同图双步骤
      ↓
导出最终 PNG 指南
```

我希望它适合真正需要长期做 **操作手册、培训材料、产品说明、故障指引、App 使用教程** 的人，而不是只适合偶尔截一张图。

## Capture · 先拍完，再整理

这是 GuidePix 1.0.1 开始推荐的方式。

### F8：只让手机截图

按一次 `F8`，GuidePix 调用手机自己的 SystemUI 截图链路，并把新截图登记到“待同步”队列。

图片此时先留在手机上，不急着在每一步都进行 USB 文件传输，所以连续操作更顺：

```text
操作手机
F8  → 待同步 1 张
继续操作
F8  → 待同步 2 张
继续操作
F8  → 待同步 3 张
```

对于已经 Root、并安装兼容安全截图模块的设备，这条路径尽量和“人在手机上正常截图”保持一致，可以让 Root / LSPosed 的截图 Hook 自然参与。

GuidePix **不会再在手机截图失败时偷偷保存一张 ADB `screencap` 黑图冒充成功**。找不到手机截图或拉取失败，会直接提示错误。

### Ctrl + F8：一次同步到电脑

流程拍完后按：

```text
Ctrl + F8
```

GuidePix 会把待同步图片依次：

1. 等待手机文件写入稳定；
2. 使用 `adb pull` 拉到电脑；
3. 验证图片能正常解码并取得尺寸；
4. JPG / WEBP 等格式统一转换成 PNG；
5. 成功后再清理手机临时副本；
6. 自动刷新当前故事板。

顶部工具栏也有 **同步手机截图** 按钮，不需要一定记快捷键。

### Shift + F8：拍一张马上标

如果只是临时想精修一张图：

```text
Shift + F8
```

GuidePix 会：

```text
手机系统截图
    ↓
只同步最新这一张
    ↓
直接打开标注器
```

## 项目目录

我不想让日常使用时看到一长串深层目录，所以新项目目录缩成：

```text
你选择的保存位置\
└─ GP-0814-153645\
   ├─ original\
   │  ├─ 001.png
   │  └─ 002.png
   ├─ project\
   │  ├─ 001.json
   │  └─ 002.json
   ├─ output\
   │  ├─ 001.png
   │  └─ 002.png
   └─ session.json
```

平时只需要认 `GP-xxxx-xxxxxx` 这一层项目目录：

- `original/`：手机原始截图，永不覆盖；
- `project/`：可继续修改的标注工程；
- `output/`：单张标注成品；
- `session.json`：顺序、Caption、步骤模式、变体等项目信息。

合集输出仍由工作台统一管理，不要求使用者手动整理内部目录。

旧版创建的项目不会被自动迁移或删除，仍然可以继续打开。

## Storyboard · 故事板

图片同步后进入故事板，可以：

- 拖动调整步骤顺序；
- 给每张图写 Caption；
- 选择全局连续编号 / 每图重新编号 / 手动编号；
- 同一张原图复制多个步骤变体；
- 批量选择后进入连续标注。

同一张原图可以做多个版本，例如：

```text
original\001.png

project\001.json
project\001-A.json
project\001-B.json
```

`001-A` 和 `001-B` 都引用同一个原图，只保存不同的标注状态。

## Annotate · 连续标注

标注器基于 [Fabric.js](https://github.com/fabricjs/fabric.js)。目前包括：

- 选择、移动、缩放、旋转；
- 矩形；
- 箭头；
- 文字；
- 自动步骤编号；
- 多区域聚光灯；
- 放大镜；
- 马赛克；
- 无痕修复；
- 画笔；
- Android UI 智能框选；
- 撤销 / 重做；
- 工程 JSON 保存；
- PNG 导出。

多个聚光区域共用**同一层遮罩**，不会因为画第二个、第三个聚光灯而把整张图越叠越黑。

批量模式里可以用上一张 / 下一张连续处理，切图前自动保存工程，尽量减少来回关闭窗口。

## Compose · 合集

GuidePix 自带四种针对操作指南的合集模板：

- **纵向长图**：适合飞书、微信、Wiki、知识库；
- **两列步骤**：适合 Word、PPT、桌面阅读；
- **前后对比**：适合设置修改前后、故障处理前后；
- **同图双步骤**：同一张原图的两个标注版本左右展示。

合集只是最终输出，不会修改原始截图或标注工程。

## 文档模式

开启文档模式后，GuidePix 会尽量管理这些容易让手册截图穿帮的状态：

- 记录进入前的 Android Demo Mode 设置；
- 尝试固定时间、电量、网络等状态栏内容；
- 隐藏通知图标；
- 临时进入勿扰，避免通知突然弹进截图。

关闭文档模式或退出 GuidePix 时，会尽量恢复进入前状态。异常退出后再次启动，也会尝试恢复遗留状态。

Android 厂商会定制 SystemUI，所以 Demo Mode 最终能控制哪些元素取决于 ROM。

## 无痕修复

我没有加入 OCR，也没有为了修一块 UI 背景塞一个大型 AI 模型。

“无痕修复”更贴近操作手册的实际需求：圈掉通知角标、悬浮按钮、临时提示、简单账号区域后，根据周围背景做颜色或邻近补片修复，并做边缘羽化。

它不是万能的内容感知填充，但对于大量纯色、卡片、弱渐变手机 UI 很实用，而且修复仍然是可撤销、可删除的工程对象，原图不动。

## 智能框选

智能框选不依赖 OCR。

GuidePix 读取 Android `uiautomator` 提供的 UI hierarchy 和控件 bounds，鼠标移动到按钮、输入框、菜单等区域时尽量自动吸附边界。

传统 Android View 页面通常效果很好；WebView、Canvas、游戏或部分 Compose 页面如果拿不到完整节点，就继续使用普通矩形，不影响基础标注。

## UI 设计

GuidePix 保留 Escrcpy 的多设备能力，但主界面不再按“同时管理几十台手机”的密度设计。

我更常见的场景是 1 台手机，偶尔 2～3 台，所以首页把这些动作放到最前面：

- 打开投屏；
- 开启文档模式；
- 手机截图；
- 截图并标注；
- GuidePix 工作台；
- 同步手机截图。

Home、返回、旋转、音量、文件管理、终端、安装 APK 等原能力仍然保留，只是不会和做指南的主流程抢位置。

## 快捷键

全局：

| 快捷键 | 功能 |
|---|---|
| `F8` | 手机截图，加入待同步队列 |
| `Ctrl + F8` | 把所有待同步截图一次同步到电脑 |
| `Shift + F8` | 手机截图 → 同步最新一张 → 立即标注 |

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

Windows 发布文件保持简单：

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

GuidePix 现在优先把 Windows + Android 手机这条链做好，但核心会尽量保持可迁移：

- Session / JSON 工程；
- Fabric.js 标注器；
- Storyboard；
- Variant；
- Composer。

未来 Android 版可以直接在手机上完成截图、标注和长图指南；iOS 版至少可以共享工程、标注、步骤管理和合集生成。设备控制和系统截图属于各个平台自己的 Adapter，不应该污染核心工程格式。

## ShareX / PixPin

我很喜欢 ShareX 的标注思路，也很喜欢 PixPin 在中文 Windows 环境里那种轻量、直接、工具就在手边的感觉。

GuidePix 会学习它们的交互取舍，但**没有复制 ShareX 的 GPL 源代码**。标注器基于 Fabric.js 和本项目自己的实现，以避免许可证混用。

PixPin 是商业软件，我只参考自己的使用体验，不使用它的代码或资源。

## 开源与上游

这个仓库源自 [viarotel-org/escrcpy](https://github.com/viarotel-org/escrcpy)，继续遵循上游的 Apache License 2.0。

第三方依赖说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 感谢

GuidePix 站在很多优秀项目的肩膀上，感谢：

- [Escrcpy](https://github.com/viarotel-org/escrcpy) 和所有贡献者 —— 整个桌面设备管理基础；
- [scrcpy](https://github.com/Genymobile/scrcpy) 和所有贡献者 —— Android 投屏与控制核心；
- [Fabric.js](https://github.com/fabricjs/fabric.js) 和所有贡献者 —— 标注编辑器基础；
- adbkit、Electron、Vue、UnoCSS 等项目和贡献者；
- [ShareX](https://github.com/ShareX/ShareX) —— 给了我很多截图标注工作流上的启发；
- PixPin —— 很多中文桌面截图工具的交互细节值得学习。

开发和重构这个项目的过程中，我使用了 **OpenAI Codex** 帮我做源码梳理、实现、重构和持续构建验证，感谢 OpenAI。

最后也感谢 **Tibo 的重置额度**，让我能把这次折腾持续推进下去。

## License

Apache License 2.0。使用和分发时请同时保留并遵守上游项目以及各第三方依赖各自的许可证和版权声明。
