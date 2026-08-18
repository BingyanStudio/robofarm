# Sprite

本文档描述贴图的使用方法

贴图根目录位于 `./packages/frontend/public/sprites`

1. 无人机

无人机贴图为 `drone.svg` `drone_enemy.svg` `drone_eyes.svg`

其中，`drone.svg` `drone_enemy.svg` 是无人机的身体，包含一个方形的机身和一个椭圆形的顶部螺旋桨

`done_eyes.svg` 是无人机的眼睛，应当被渲染在无人机机身的中间，当无人机移动时，眼睛应当向移动方向偏移，实现可爱的动画效果

无人机的编号应当渲染在无人机的机身上半部分 (额头)

如果你无法识别图片，则应当告诉我在哪里调整眼睛和编号的渲染位置，我来精细调整


2. Tile

地块贴图由 TILES 注册表的 sprite / spriteWithCrop 字段驱动 (前端自动按名加载):
- `grass.svg`: 土地 (soil) 无作物时
- `field.svg`: 土地 (soil) 有作物时
- `water.svg`: 水池 (water)
- `sand.svg`: 沙地 (sand) 无作物时
- `sand_field.svg`: 沙地 (sand) 有作物时

3. 作物

所有作物贴图位于 `./packages/frontend/public/sprites/crop`, 为 avif 格式

所有作物贴图为正方形，可以直接铺满一个 Tile 渲染

同一种作物有多个不同后缀 (_1, _2, ..), 从小到大为作物生长阶段贴图，应当随着作物生长均匀地改变, 最小的后缀为刚种下时贴图，最大的后缀为成熟时贴图

当前已实装全部作物贴图 (strawberry / grape / wheat / lotus / pumpkin); 新增作物时,
代码名与贴图文件名保持一致 (见 agent/CROP.md), 前端会自动按阶段加载