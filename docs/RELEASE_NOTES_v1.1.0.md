# Canvas ComfyUI Remote v1.1.0

[简体中文](RELEASE_NOTES_v1.1.0.md) | [English](RELEASE_NOTES_v1.1.0.en.md)

## 下载文件

- `Canvas-Gateway-Setup-v1.1.0.exe`：推荐的Windows安装向导。
- `Canvas-Gateway-Windows-v1.1.0.zip`：绿色便携版Gateway。
- `Canvas-Android-v1.1.0.apk`：安卓客户端。
- `SHA256SUMS.txt`：三个安装资源的SHA-256校验值。

## 本次更新

- 新增简体中文/英文Windows安装向导；
- 自动识别秋叶整合包、官方便携包及venv中的ComfyUI Python；
- 可选创建桌面快捷方式和开机启动项；
- 覆盖升级默认完整保留配置、提示词、收藏和配对状态；
- 卸载默认保留个人数据，只有明确确认才删除；
- Gateway浏览器跨域来源限制为Android Capacitor本地来源；
- 八位配对码增加每分钟八次失败尝试限制；
- 增加自动化安装、升级、卸载和数据保留测试；
- 更新隐私、安全和安装说明。

## 安装

新用户优先运行Setup安装器，选择包含`main.py`的ComfyUI目录。已经使用ZIP版的用户也可以直接安装；原有`%APPDATA%\CanvasGateway`会被识别并保留。

公开版暂未购买Windows代码签名证书，因此可能显示“未知发布者”。请只从本仓库发行页下载，并使用`SHA256SUMS.txt`校验。
