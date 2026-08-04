# 我们之间 · Between Us

一款为悉尼—爱丁堡异国情侣设计的双时区共享日程 PWA。

## 第一版功能

- 悉尼与爱丁堡实时时钟，自动处理夏令时
- 月历和按同一真实时刻对齐的双人时间轴
- 拖动已保存的标签调整时间；上下改变时间，左右切换悉尼或爱丁堡归属
- 拉伸标签顶部或底部调整开始/结束时间，实时按 15 分钟刻度计算；手机端需长按边缘后操作
- 支持跨午夜行程；结束时间早于开始时间时自动视为次日结束
- “悉尼日 / 爱丁堡日”日期基准切换
- 忙碌、空闲、标题、详情和隐私显示
- 每周重复行程（保持创建者当地时间不变）
- 根据双方“空闲”标签的重叠部分计算共同空闲，冲突时以“忙碌”为准
- 一个共享密码，双方分别填写昵称（默认 `ta`），昵称会保存并同步
- Supabase 实时云同步；未配置时自动使用本地预览模式
- 可安装到 iOS、Android 和桌面系统

## 立即本地预览

需要 Node.js 18 或以上版本。

```powershell
npm install
npm run dev
```

打开终端显示的网址。默认本地共享密码是 `together`。

## 开启双方实时同步

1. 在 [Supabase](https://supabase.com/) 创建一个项目。
2. 打开 SQL Editor，运行 [`supabase/schema.sql`](./supabase/schema.sql)。已运行过旧版本脚本时也请重新运行一次，以添加昵称表。
3. 在 Authentication → Users 中创建一个共享用户。邮箱只作为内部账号使用，双方不会在页面上输入它；请关闭或完成邮箱确认。
4. 复制 `.env.example` 为 `.env.local`，填入项目 URL、anon key、共享邮箱和可选的本地密码。
5. 重启开发服务器。顶部出现“实时同步”即表示连接成功。

Supabase 的行级安全策略会将所有行程限制在这个共享账号下；密码由 Supabase Auth 处理，不会保存在项目代码或数据表中。

## 正式部署

推荐将仓库导入 Vercel，并在 Vercel Project Settings → Environment Variables 中填写与 `.env.local` 相同的前三项配置。构建命令为 `npm run build`，输出目录为 `dist`。

部署后，在 iPhone Safari 中打开网址，选择“分享 → 添加到主屏幕 → 作为网页 App 打开”。

## 验证命令

```powershell
npm run lint
npm run build
npm audit
```
