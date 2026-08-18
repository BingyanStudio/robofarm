# Bugs

此处放置所有 Bug, 请将其修复后, 在本文档中打 x 并描述修复方式

- [x] Enhancement: 游戏界面的 "提交" 按钮靠右对齐，改成金黄色 accent 且拉长
  - 实现: 新增 .btn-submit 样式 (金黄色 #c9971f + 金色描边, min-width 150px,
    margin-left:auto 在控制条内靠右), single.ts 的提交按钮套用该类。
- [x] Enhancement: 按下 "提交" 按钮后, 应当先弹窗提示 "确认将代码提交到服务器验证", 玩家确认后再提交
  - 实现: submitFromButton 在登录检查后先弹确认弹窗 (确认提交/取消), 玩家确认后才继续
    检查服务器忙碌并 POST /single/validate。
- [x] Enhancement: 多人竞技模式, 对方的金钱使用淡红色字体展示, 与我方区分开
  - 实现: game-layout.ts 竞技模式下金钱行拆分为"我方/对方"两个 span, 对方套 .money-enemy
    (淡红色 #f08a8a), 我方保持金色。