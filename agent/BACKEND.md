# Backend

本文档描述游戏后端的结构与功能

## 全局

1. 使用 Sqlite 作为数据库存储一切数据
2. 使用 Typescript 开发


## 1. 登录鉴权

根据 Github Oauth2 进行鉴权，以 Github 用户名为玩家名称记录玩家账号与数据

API 根据实际情况确定即可


## 2. 单人排行榜

- `GET /single/history`: 返回当前账号历史成绩数组
- `POST /single/validate`: 
    1. 接收前端上传的代码
    2. 检查当前是否有正在运行的验证，如果有则反馈错误码
    3. 如果没有，则执行验证
- `GET /single/validate`: 获取当前是否有正在运行的单人模式分数验证
    1. `busy`: boolean, 确认当前是否正在执行
    2. `progress`: number, 如果正在执行，返回执行的进度，否则返回 1.00
    3. `score`: number, 如果执行完毕, 返回执行的分数结果，否则返回 0
- `GET /single/leaderboard`: 获取当前排行榜，包含玩家名和分数


## 3. 多人模式

- `GET /combat/state`: 返回本用户的出战代码情况 (是否有出战代码，出战代码内容，胜败数量)
- `POST /combat/upload`: 上传出战代码，上传时会清空胜败数量
- `GET /combat/list`: 返回当前可对战的列表，包括用户名、胜败数量、id，需要排除本用户的代码
- `POST /combat/start`: 指定一个 id, 将当前用户的出战代码与指定 id 的代码启动一个对战，返回一个 Room ID 指定对战房间号
- `WS /combat/room/<id>`: 以 websocket 接入这个对战房间 
- `GET /combat/room`: 获取当前全部的对战房间 (用于观战)
- `GET /combat/history`: 返回当前用户的历史对战数据 (包括主动挑战其他人，和其他人挑战当前用户)，包含对局回放数据与结果