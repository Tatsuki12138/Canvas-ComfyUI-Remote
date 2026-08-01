# Canvas ComfyUI Remote v1.1.0 安全与隐私审计

审计日期：2026-08-01

本记录覆盖 v1.1.0 源代码、Git 历史、Android APK、Windows 安装器、Windows 便携包和打包后的 Gateway 运行行为。它说明本次实际检查了什么，但不等同于第三方安全认证。

## 结论

- 未在 Git 历史、当前源码或发布物中发现已知密钥、私人路径、私人 Tailscale 地址、配对码或运行时个人数据；
- Gateway 打包后只监听 `127.0.0.1`，`/web` 不提供网页端，未配对访问受保护 API 返回 `401`；
- Android APP、Gateway 源码、首次安装、覆盖升级和卸载流程均通过自动测试；
- 三组 Python 依赖和 Android 生产依赖未发现已知漏洞；
- Microsoft Defender 对最终发布目录的自定义扫描未发现威胁；
- Android APK 已使用项目发布证书签名；Windows EXE 暂无 Authenticode 商业代码签名。

## 实际执行的检查

| 检查项 | 结果 |
| --- | --- |
| Gateway 自动测试 | 5 项通过 |
| APP 提示词存储测试 | 通过 |
| 打包 Gateway 冒烟测试 | 版本、模式、404、401、监听地址全部通过 |
| 安装器首次安装 | 通过 |
| 覆盖升级保留配置和个人数据 | 通过 |
| 卸载移除程序但默认保留个人数据 | 通过 |
| `pip-audit`：运行、构建、开发依赖 | 未发现已知漏洞 |
| `npm audit --omit=dev` | 0 个漏洞 |
| Gitleaks：Git 历史与当前工作区 | 未发现泄露 |
| APK/ZIP 条目扫描 | 未包含 Gateway 运行时配置、状态、日志、收藏或结果目录 |
| APK/ZIP/EXE 私人值扫描 | 未发现私人路径、设备地址、域名、账号邮箱或历史配对码 |
| Microsoft Defender 自定义扫描 | 0 个新增威胁 |
| SHA-256 校验文件回读验证 | 全部匹配 |

## 发布物校验

每次正式构建都会在同一发行目录生成 `SHA256SUMS.txt`。下载后应使用该文件核对 APK、ZIP 和安装器；仓库发行页上传的四个文件来自同一次构建。审计报告不内嵌这些会随构建变化的文件哈希，以免把旧哈希递归打包进新发布物。

APK 签名证书 SHA-256：

```text
50d40febce5426a91793121cdb91d416b3bb2fa27e5bda998ea2dd3afeb41586
```

## 数据流与隐私边界

- 生图提示词、输入图和生成结果在 Android APP、Tailscale 私网、Gateway 与本机 ComfyUI 之间传输；Canvas 没有自建云端后台或遥测。
- 使用 Danbooru 搜索时，搜索标签和所请求的 Danbooru 图片地址会发送给 Danbooru；配置代理后，这部分流量还会经过该代理。
- 提示词、设置、收藏、配对状态和外部 API Key 保存在本机 `%APPDATA%\CanvasGateway`。这些文件没有额外进行磁盘加密，依赖 Windows 账号权限保护。
- 安装器不会安装或重新配置 Tailscale，不会启用 Funnel，也不会修改 Windows 防火墙。
- 安装器升级不覆盖个人数据；卸载默认保留个人数据，只有用户在卸载提示中明确确认才会删除。

## 已知限制

- Windows 安装器与 Gateway EXE 未使用 Authenticode 证书签名，Windows 可能显示“未知发布者”。应只从项目发行页下载并核验 `SHA256SUMS.txt`。
- 本项目定位为个人使用，不是经过加固的多租户服务。Windows 账号、Tailnet 成员设备或代理服务一旦失陷，Canvas 无法提供额外隔离。
- 漏洞数据库和杀毒特征会持续更新；“本次未发现”不代表以后永远不存在风险。
