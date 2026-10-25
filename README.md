# browser-script

自用浏览器用户脚本合集，包含 B 站内容过滤和网盘下载辅助功能。

- GitHub：[TwinsDestiny/browser-script](https://github.com/TwinsDestiny/browser-script)
- Greasy Fork：[TwinsDestiny](https://greasyfork.org/zh-CN/users/810690-twinsdestiny)

## 脚本列表

| 脚本 | 作用 | 使用说明 |
| --- | --- | --- |
| [bilibili-ad-block.js](./bilibili-ad-block.js) | 隐藏 B 站首页广告、推广卡片，以及部分播放页、直播和动态页广告元素 | 安装后自动处理匹配的页面元素 |
| [bilibili-block.js](./bilibili-block.js) | 获取已登录账号的 B 站黑名单，按 UP 主名称过滤视频卡片和评论 | 先登录 B 站，并在账号黑名单中添加要屏蔽的 UP 主 |
| [pan-download.js](./pan-download.js) | 为百度、阿里、天翼、迅雷、夸克、移动云盘提供 API 下载和 cURL 命令复制 | 选中文件后使用“下载助手”；网盘配置内嵌，无需输入公众号启用码 |

网盘下载助手仅保留 **API 下载**和 **cURL 下载**。API 模式通过浏览器发起下载，也可由已安装的下载工具接管；cURL 模式生成终端命令，支持单条或全部复制，Windows 使用 `curl.exe`，macOS/Linux 使用 `curl`。

百度个人盘下载使用 OAuth 授权和下载链接中的 access token，不以读取 BDUSS 为前置条件。百度、迅雷、夸克分享页当前会引导先转存到自己的网盘；脚本没有递归下载整个文件夹的功能。

页面结构和网盘接口可能调整，支持范围以实际页面验证结果为准。

## 安装与使用

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 等用户脚本管理器，并允许其在目标网站运行。
2. 在 Greasy Fork 找到对应脚本，点击“安装此脚本”；也可以在管理器中新建脚本，粘贴本仓库中对应 `.js` 文件的完整内容并保存。
3. 刷新目标网站。B 站脚本自动运行，网盘脚本通过“下载助手”菜单操作。

每个 `.js` 文件都是独立脚本，可以按需安装。它们通过 `@require` 加载各自声明的外部依赖，不需要在本地执行 `npm install` 或构建。

## 来源与许可证

仓库附带 [MIT License](./LICENSE)。B 站两个脚本的文件头标注作者为 TwinsDestiny、许可证为 MIT。

网盘下载助手改编自 [syhyz1990/baiduyun](https://github.com/syhyz1990/baiduyun)，上游作者为 YouXiaoHou。本次采用的上游 6.2.7 源码文件头标注 `AGPL-3.0-or-later`，而当前 `pan-download.js` 文件头标注 `MIT`；两者存在许可声明差异，发布前需要核对该文件的许可与来源说明，不能把仓库级的 MIT 声明直接当作所有上游代码的许可结论。
