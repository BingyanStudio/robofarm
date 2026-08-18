# TODO

此处放置所有待办事项

- [x] Enhancement: `api-docs` 拆分: 纯 Markdown 进入 llm.txt, 还需要将 Markdown 渲染为符合网页整体风格的文档页面，在主菜单增加 API 按钮，跳转到这个页面。注意，美观网页需要按照功能分类，且增加tab方便人类跳转
    - 实现: 数据源重构到 shared/api-docs.ts (结构化, 单一来源) —— Markdown (apiDocsMarkdown)
      与网页版共用; /llm.txt 并入纯 Markdown API 文档; 新增 #/api-docs 网页页
      (Tab 分类: 认证/单人/竞技/WebSocket/MCP/其他, Method 彩色徽标, 每个 API 含
      端点/Method/Header/Schema/Example), 主菜单新增 "API 文档" 按钮