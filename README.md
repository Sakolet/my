# 我们之间 · Between Us

一款为身处不同时区的情侣、朋友设计的双城市共享日程 PWA。

## 第一版功能

- 可从世界主要城市中选择双方所在地，实时时钟自动处理日期和夏令时
- 月历和按同一真实时刻对齐的双人时间轴
- 拖动已保存的标签调整时间；上下改变时间，左右切换双方城市归属
- 拉伸标签顶部或底部调整开始/结束时间，实时按 15 分钟刻度计算；手机端需长按边缘后操作
- 支持跨午夜行程；结束时间早于开始时间时自动视为次日结束
- 双方城市日期基准切换
- 忙碌、空闲、标题、详情和隐私显示
- 每周重复行程（保持创建者当地时间不变）
- 根据双方“空闲”标签的重叠部分计算共同空闲，冲突时以“忙碌”为准
- 可在登录页创建或加入共享空间，双方使用同一个共享密码
- 双方分别设置昵称和城市，并可在进入后随时修改
- 带作者昵称和城市的实时双人留言板
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
3. 在 Authentication → Sign In / Providers 中开启 Anonymous Sign-Ins。程序会为每台设备静默创建匿名身份，不需要邮箱、验证码或确认邮件。
4. 复制 `.env.example` 为 `.env.local`，只需填入项目 URL、publishable key 和可选的本地预览密码。
5. 重启开发服务器。顶部出现“实时同步”即表示连接成功。

首次使用时在登录页选择“创建空间”；另一方随后选择“加入空间”，输入同一共享密码和自己的昵称、城市。共享密码经过 SHA-256 后作为唯一房间主键，数据库不会保存明文密码。

Supabase 的行级安全策略会将资料、行程和留言限制在已经加入该房间的匿名设备身份下。

## 正式部署

推荐将仓库导入 Vercel，并在 Vercel Project Settings → Environment Variables 中填写 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。构建命令为 `npm run build`，输出目录为 `dist`。

部署后，在 iPhone Safari 中打开网址，选择“分享 → 添加到主屏幕 → 作为网页 App 打开”。

## 验证命令

```powershell
npm run lint
npm run build
npm audit
```
