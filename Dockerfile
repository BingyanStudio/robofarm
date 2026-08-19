# syntax=docker/dockerfile:1
# RoboFarm 容器化构建。
#
# 对外暴露 (单端口, 默认 3001):
#   - 前端页面            GET  /
#   - 后端 API            /auth/* /single/* /combat/* /llm.txt /api-docs
#   - MCP (streamable HTTP)  POST /mcp
#   - 对战直播 WebSocket   WS   /ws/combat/room/:roomId
#
# 数据目录: 容器内 /data 为卷, data.db 与 .env 都基于启动时工作目录 (/data) 生成,
# 挂载到容器外即可持久化/备份:
#   docker run -d -p 3001:3001 -v robofarm-data:/data robofarm
#   docker run -d -p 3001:3001 -v /host/path:/data robofarm
#   (bind mount 时确保宿主目录对容器内 node 用户 UID 1000 可写)
#
# 配置通过环境变量或挂载的 /data/.env 提供 (容器环境变量优先):
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET (不配置则开发模式, 自动登录 local-dev)
#   FRONTEND_ORIGIN / GITHUB_REDIRECT_URI (部署在独立域名时)
#   TURN_INTERVAL_MS / SINGLE_MAX_CONCURRENT / SINGLE_SUBMIT_LIMIT_PER_MIN

# ---------- 阶段 1: 构建发布版 (release/, 完全自包含) ----------
FROM node:24-slim AS build
WORKDIR /src

# 先只复制清单并安装依赖, 利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm ci

# 复制源码并打包 (shared → backend → frontend → release/)
COPY . .
RUN npm run package

# ---------- 阶段 2: 运行 (仅需 Node >= 24, 无需 node_modules) ----------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=data.db

WORKDIR /app
COPY --from=build /src/release/ /app/

# 数据卷: data.db 与 .env 均落在启动时的 cwd (/data) 上
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

WORKDIR /data
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/llm.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.cjs 按 __dirname 解析 esbuild.wasm / runner / public, 因此放在 /app;
# 启动 cwd 为 /data → data.db 与 .env 在卷内
CMD ["node", "/app/server.cjs"]
