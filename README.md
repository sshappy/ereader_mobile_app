# ereader_mobile_app

类微信读书移动阅读 App：导入自有电子书、书架管理、EPUB 阅读与双通道听书（本地离线 TTS / 免费云端 TTS）。

> **合规声明（PRD 原文）**：本 App 仅支持您合法拥有、且不含 DRM（数字版权保护）的电子书文件，不提供任何 DRM 破解或绕过功能。请确认您对该文件拥有合法使用权。

听到云端语音时请注意："使用云端 TTS 时，朗读文本会发送至语音服务"。首次切换云端必须确认，设置页可随时关闭；关闭后立即停止云端播放并回退本地。

## 功能与交付范围（T01–T05 全部完成）

| 模块 | 能力 |
| --- | --- |
| 导入与书架（R-01/R-02/R-04） | 系统文件选择器导入 EPUB/MOBI/AZW/AZW3，合规声明弹窗、按文件名+大小去重、DRM 检测与拒绝、书架网格、最近阅读排序、二次确认删除 |
| 阅读器（R-05/R-06/R-07/R-14） | WebView 渲染净化后的章节 HTML、主题 CSS 注入、滚动比例上报进度、字号/行距/日夜间/翻页模式、目录抽屉、章内偏移记忆 |
| 听书（R-08/R-09/R-10/R-11） | 本地离线 TTS、免费云端 Edge TTS、分片队列、播放/暂停/停止/上下章、语速与音色、章末续播策略、失败降级提示 |
| 设置（R-11） | 通道、语速、音色、主题、字号、云端朗读开关（含知情确认）、合规声明查看 |

不支持、也不包含：账号、支付、订单、订阅、云同步、DRM 破解/绕过。

## 环境与原生工程生成（重要）

本仓库**不包含** `android/` 与 `ios/` 原生目录（本机不编译原生工程）。请在本机执行：

```bash
cd G:/workbuddy_file/2026-11-23-10-40-59
npx react-native@0.74 init ereader_mobile_app --version 0.74.5 --directory ereader_mobile_app_native
# 只从生成的原生模板中拷贝 android/ 与 ios/ 目录（以及必要的原生配置文件）到本目录，
# 不要覆盖本仓库已有的 package.json / src / js 配置。
```

环境要求：

- Node.js LTS ≥ 18（建议 20）
- JDK 17（Android Gradle 构建）
- Android SDK：compileSdk 34、buildTools 34.0.0、**minSdkVersion 26**（Android 8.0）
- Xcode 14+ / CocoaPods（iOS 构建），**iOS Deployment Target 13.0**
- Ruby + Bundler（用于 `bundle exec pod install`）

生成原生工程后按以下要求修改：

1. `android/build.gradle`：`minSdkVersion = 26`、`compileSdkVersion = 34`、`targetSdkVersion = 34`。
2. `android/app/src/main/AndroidManifest.xml`：Android 12 及以下声明 `READ_EXTERNAL_STORAGE`；Android 13+ 使用系统文件选择器（SAF），无需存储权限。应用只读用户主动选择的文件。
3. `android/app/build.gradle`：确保 `applicationId` 与 `index.js` 注册名一致（`ereader_mobile_app`）。
4. `ios/Podfile`：`platform :ios, '13.0'`，然后 `cd ios && bundle exec pod install && cd ..`。
5. 按各原生库 README 完成自动链接（RN 0.74 默认 autolinking）；无需手动编译任何 C/C++ 或 `.so`。

## 安装、编译与运行

```bash
npm install
npm run typecheck   # tsc --noEmit，CI 必过
npm test            # Jest 纯 JS/Store 逻辑测试，无需模拟器

npm run android     # 需 Android Studio / 模拟器或真机
npm run ios         # 需 macOS + Xcode
```

开发服务器：`npm start`（ Metro）；真机调试需开启 USB 调试并信任开发者证书。

## 目录约定

- `src/types`：统一类型出口（`src/types/index.ts`），禁止深链引用
- `src/constants`：路径模板、错误码与文案、存储 key（前缀 `ereader:v1:`）
- `src/utils`：错误归一化、日志、纯 JS 文本分段与二进制助手
- `src/services`：面向接口的适配器层；**只有** `fileServiceImpl.ts` 直接 import RNFS / DocumentPicker
- `src/services/parser`：纯 JS 的 EPUB / MOBI 解析，可在 Node/Jest 直接测试
- `src/services/tts`：本地与云端双通道；Edge TTS 客户端单点内聚，异常归一到 `E_TTS_*`
- `src/store`：Zustand Store 与服务装配点；persist 仅白名单设置、进度、书目摘要（`Chapter[]` 只在内存）
- `src/theme`：日间/夜间色板与主题 Provider
- `src/components` / `src/screens` / `src/navigation`：通用组件、页面与主栈
- `__mocks__`：原生模块 Jest mock，测试不触网、不访问真实文件系统

## 权限与隐私

- 文件通过系统文件选择器导入，应用只把选中的文件复制到自己的私有目录；不读取整个外部存储。
- 云端 TTS 会把朗读文本片段发送到第三方语音服务；首次使用必须确认，设置页可随时关闭（关闭后立即停止云端播放并回退本地）。
- 所有数据仅存本机（AsyncStorage + 应用私有目录），无账号、无同步、无支付。
- MOBI/AZW/AZW3 为 P1 纯 JS best-effort 解析；失败时提示"建议先用 Calibre 等工具转换为 EPUB 后导入"，不承诺全格式覆盖。
- 检测到 DRM 时直接拒绝导入并删除临时文件；代码库不含任何解密、密钥提取或绕过逻辑。

## 已知限制

1. Edge TTS 为免费非官方接口，握手 token/参数可能变动；已单点封装在 `src/services/tts/edgeTtsClient.ts` 并带超时与降级提示，真机环境需实测，必要时仅替换该文件。
2. 本地中文嗓音依赖设备预装；无中文嗓音时会提示"设备未安装中文嗓音，可切换云端 TTS"。
3. 本机无法运行模拟器/真机，QA 覆盖为类型检查 + 单元测试；原生编译与语音播放请在本机完成。
4. 合规文案采用 PRD 原文，上线前建议产品/法务复核。
