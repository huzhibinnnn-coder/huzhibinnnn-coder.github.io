# 胡志彬作品集

一个面向 HR 的个人作品集网站，包含特效、三维建模、AIGC、剪辑和游戏制作五个分类。

## 编辑内容

公开网站只有查看功能。站长可在公开页按 `Ctrl + Alt + E` 进入独立后台，也可以直接访问 `/admin.html`。

后台会验证 GitHub 账号必须是仓库所有者，并要求当前仓库的写入权限。使用仅授权 `huzhibinnnn-coder.github.io` 仓库、拥有 `Contents: Read and write` 权限的 Fine-grained personal access token 作为管理员密钥。密钥不会写入网站或浏览器存储，关闭页面后会清除。

后台支持编辑个人资料与主题，新增、修改、删除作品，以及上传图片、视频和附件。点击“发布全部修改”后，GitHub Actions 会自动更新公开网站。

公开页使用轻量静态封面，视频在访问者点击播放前不会发起网络请求。后台上传的新封面也会自动生成适合网页加载的轻量版本。

## 本地查看

在 `dist` 目录启动任意静态文件服务器，然后访问其本地地址。不要直接双击 `index.html`，浏览器会阻止加载数据文件。

## GitHub Pages

推送到 `main` 分支后，GitHub Actions 会发布 `dist` 目录。首次使用时，在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
