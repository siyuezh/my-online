# YEZI Personal Site

## 公开展示

直接部署到 GitHub Pages 等静态托管平台时，首页、归档、作品、图片、音乐和歌词均可正常展示。页面检测不到编辑服务时会自动隐藏管理员入口，网站保持只读。

## 启用管理员功能

管理员发布、编辑、删除、评论管理和图片上传需要运行 Python 服务：

```text
python dev_server.py
```

本地开发使用 `python set_editor_password.py` 生成仅保存在本机的 `.editor-auth.json`。

部署到云平台时，不要上传密码文件；请设置以下环境变量：

```text
YEZI_EDITOR_PASSWORD=你的管理员密码
HOST=0.0.0.0
PORT=平台提供的端口
```

启动命令仍为 `python dev_server.py`。生产环境应启用 HTTPS。当前 JSON 文件存储适合个人小站；使用无持久磁盘的云平台时，重启后新增内容可能丢失。
