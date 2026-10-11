#星回邢辉-注

##部署到GitHub页面

本项目是无后端、无外部应用程序接口的纯前端应用,可通过GitHub操作自动部署到GitHub页面.

-构建命令：`npm运行构建`
-发布目录：`距离/`
-自动部署：向`主要的`分支推送后,工作流`。github/workflows/deploy.yml`会执行`npm ci`、`npm运行构建`,并通过GitHub页面操作发布。
-手动部署：在开源代码库仓库的**操作→部署到GitHub页面→运行工作流**中手动触发。
-首次使用前,需要在仓库**设置→页面→构建和部署**中将来源设为**GitHub操作**。
-最终访问地址：`https://<用户名> . github.io/<仓库名>/`

应用使用混杂路由（如`#/聊天`、`#/管理`),因此无需额外的 404 回退文件。
纯前端、本地优先的字卡聊天应用。数据保存在浏览器`本地存储`,不依赖登录、云端配置或外部API .

##本地运行

环境要求：

-节点. js`^20.19.0` 或 `>=22.12.0`
-npm`10+`
-铬或边缘(推荐)

安装并启动开发服务器：

```bash
npm ci
npm run dev
```

## 构建

```bash
npm ci
npm run build
```

构建产物输出到 `dist/`。仓库中的 `public/_redirects` 会在构建时复制到 `dist/_redirects`，内容为：

```text
/* /index.html 200
```

该规则只在 Netlify 上生效；Cloudflare 的 SPA 回退由 `wrangler.jsonc` 中的 `not_found_handling` 负责，因此部署到 Cloudflare 时该文件会被自动排除。

## 部署到 Cloudflare（当前线上环境）

线上地址：https://xinghui-note.2587785995.workers.dev

Workers 名称 `xinghui-note`，静态资源目录为 `cloudflare-assets/`（见 `wrangler.jsonc`）。Vite 构建输出到 `dist/`，所以更新时需要把产物同步过去，这一步已封装成脚本。

首次部署前如未登录，先执行 `npx wrangler login`。

更新并发布：

```bash
npm run deploy
```

该命令依次完成三件事：

1. `npm run build` — 重新构建到 `dist/`。
2. `node scripts/sync-assets.mjs` — 清空并重建 `cloudflare-assets/`，同步构建产物，同时排除 `_redirects` 与 `.assetsignore`。
3. `wrangler deploy` — 上传并发布，网址保持不变。

只想本地预览时，可执行：

```bash
npm run build
npm run preview
```

## 备选：部署到 Netlify Drop

1. 在项目根目录执行 `npm ci` 和 `npm run build`。
2. 确认 `dist/` 中包含 `index.html`、`assets/` 和 `_redirects`。
3. 打开 [Netlify Drop](https://app.netlify.com/drop)。
4. 将整个 `dist/` 文件夹拖入上传区域。不要上传项目根目录或 `node_modules/`。
5. 等待部署完成，打开 Netlify 返回的公开网址。
6. 访问首页、聊天、管理、收藏、设置、数据备份和拍一拍，并刷新任一视图确认没有 404。

> 更新已有 Netlify 站点时，要拖到该站点的 Deploys 页面覆盖部署；拖到 Drop 首页会新建一个站点并生成新网址。

> Netlify Drop 的新建站点在未认领状态下会由 Netlify 自动设置访问密码，并在约 1 小时后过期。密码会显示在部署详情页；如需长期公开访问，请点击“Claim this site”并使用免费 Netlify 账号认领站点。

## 部署说明

- 构建命令：`npm run build`
- 发布目录：`cloudflare-assets/`（Cloudflare）/ `dist/`（Netlify）
- SPA 回退：Cloudflare 使用 `wrangler.jsonc` 的 `not_found_handling`；Netlify 使用 `dist/_redirects`
- 环境变量：不需要
- 后端或云服务：不需要
- 数据存储：浏览器 `localStorage`
- 外部请求：无；页面字体与资源均随构建产物或系统本地提供

部署后无需注册或登录即可使用。清除浏览器数据会删除该浏览器内的应用数据，请先在“数据备份”视图中导出备份。