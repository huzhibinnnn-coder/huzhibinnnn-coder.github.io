# 胡志彬作品集

一个面向 HR 的个人作品集网站，包含特效、三维建模、AIGC、剪辑和游戏制作五个分类。

## 编辑内容

打开网站后点击右上角“编辑”。你可以先在本设备预览个人介绍、主题和作品修改。

需要正式发布时，在“连接 GitHub”中填写仓库信息，并使用仅授权当前仓库、拥有 `Contents: Read and write` 权限的 Fine-grained personal access token。密钥不会写入网站或浏览器存储，关闭页面后会清除。

## 本地查看

在 `dist` 目录启动任意静态文件服务器，然后访问其本地地址。不要直接双击 `index.html`，浏览器会阻止加载数据文件。

## GitHub Pages

推送到 `main` 分支后，GitHub Actions 会发布 `dist` 目录。首次使用时，在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
