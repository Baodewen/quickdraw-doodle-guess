# QuickDraw AI 画猜 — 技术思路与架构说明

> 面向接手本项目、或需要理解其实现的人。本文讲「为什么这样设计」与「技术原理」；
> 「怎么运行」请看根目录 `README.md`。本包不包含大体量资产（模型权重、图片、视频），
> 补齐方式见文末第 8 节。

---

## 1. 项目定位

一个**完全本地、零外部模型依赖**的实时涂鸦识别 Web 应用：

- 用户在浏览器 Canvas 上画简笔画；
- 后端每 0.5 秒用本地 CNN 猜画的是 20 类中的哪一个；
- 猜中后可选「AI 续画」（浏览器内离线 SketchRNN 接着画）或「AI 美化」（服务端代理外部图片生成）；
- 附一个纯前端的「奶龙点睛」彩蛋。

核心目标不是产品化，而是演示一条**「浏览器画布 → 图像预处理 → CNN 推理 → 前端反馈」**的完整链路，以及**模型如何运行在浏览器 Worker 里**。

---

## 2. 总体架构

```
浏览器（Vue 3 SPA，无路由/无状态库）
 ├─ Canvas 2D 画板（280×280 逻辑坐标）
 ├─ 7 个 composable 管理全部状态
 ├─ Web Worker 跑 SketchRNN 续画
 └─ <video>/<img> 播放奶龙媒体
        │  fetch /api/*            │  同源 /static/*
        ▼                          ▼
FastAPI + Uvicorn（Python，:8000）
 ├─ /api/predict   → PyTorch CNN（进程启动时加载 model.pt，常驻内存）
 ├─ /api/enhance   → 外部 AI 美化代理（令牌只在服务端）
 └─ StaticFiles    → 托管前端构建产物
```

**分工原则**：前端负责「画、记、看」，后端只做「识别 + 外部代理」，续画完全下沉到浏览器 Worker。

---

## 3. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3（Composition API）+ Vite + 原生 JS；Canvas 2D；Web Animations API；Classic Web Worker；Fetch + AbortController |
| 后端 | Python 3.12 + FastAPI + Uvicorn + Pydantic v2 |
| 机器学习 | PyTorch（CNN）+ NumPy + Pillow；sklearn（评估）+ matplotlib（可视化） |
| 续画 | Google SketchRNN 预训练模型 + `sketch_rnn.js`/`numjs.js` 运行时 |
| 构建发布 | Vite build → `publish.mjs`（Node fs）→ FastAPI 托管 |

无数据库、无登录、无 Docker、无云端依赖（识别与续画部分）。

---

## 4. 核心数据流

### 4.1 识别链路（画布 → CNN）

```
画布 280×280 PNG → base64 data URL
  → 后端解码 → 灰度
  → 空白检测（墨迹 < 0.3% 直接返回 is_blank，不发请求）
  → 内容包围盒裁切（阈值 245）
  → 补 8px 白边 → 补成正方形 → LANCZOS 缩到 28×28
  → 反色（QuickDraw 是白线黑底）→ 归一化 [0,1]
  → 张量 (1,1,28,28) → CNN → softmax → Top-5
```

前端 `usePredictions` 每 500ms 轮询一次，但用 `revision` 去重：画面没变就不重复请求；
用 `AbortController` 取消上一轮未完成的请求，避免乱序覆盖。

**稳定判定（防抖动）**：Top-1 概率 ≥ 0.65 且**连续两轮**是同一类别，才算「猜到」，
之后停止重复请求并触发续画。

### 4.2 续画链路（画布 → SketchRNN，纯浏览器）

```
落笔完成 → CNN 连续两次 ≥65% 确认类别（且匹配最新画板 revision）
  → Worker 加载本地 *.gen.json 模型（7 个，约 3MB/个）
  → 笔画预处理：橡皮擦过滤 → RDP 简化(2) → 280→256 坐标变换
  → 温度采样（0.15~0.85）生成 3 个候选
  → 逆变换回 280 坐标 → 三色虚线预览 → Tab/Enter 选择采纳
```

「离线」指续画不访问外部模型服务；但 CNN 识别仍需 Python 后端。

### 4.3 美化链路（画布 → 外部 AI）

```
前端提交画布 PNG + CNN 识别结果 → 后端 enhance.py
  → Pillow 合成白底、EXIF 校正、pad 成 1024×1024 PNG
  → 上传参考图 → 创建任务 → 轮询 → 下载结果
  → 内存缓存 30 分钟，同源 /api/enhance/{id}/image 返回
```

安全要点：令牌只从环境变量 `XAIS_TOKEN` 或 `backend/.xais-token` 读取，前端与构建产物永不接触；
单任务并发锁防止重复扣额度；单任务 240s 超时。

### 4.4 彩蛋链路（奶龙点睛）

纯前端 SVG + 状态机 `idle → intro → waiting → waking → alive`：

- 线稿是 `pointer-events:none` 的 SVG 叠加层，不写入画笔数据，因此不进入 CNN/导出；
- 逐笔描边用 `getTotalLength()` + `stroke-dasharray` + Web Animations API；
- 眼睛命中用椭圆测试，两只都完成才唤醒；
- 媒体降级链：`HEAD` 探测 webm→mp4→webp→gif，失败回退静帧，再失败保留呼吸线稿；
- `prefers-reduced-motion` 下跳过描边、不自动播放。

---

## 5. 关键算法与设计决策

### 5.1 CNN 结构（`ml/model.py`）

```
Conv(1→32,3×3) + ReLU + MaxPool2  → 32×14×14
Conv(32→64,3×3) + ReLU + MaxPool2 → 64×7×7
Flatten → Linear(3136→256) + ReLU + Dropout(0.3) → Linear(256→20)
```

约 0.83M 参数，CPU 推理约 0.12ms/张，适合本地常驻。

### 5.2 数据增强（`ml/train.py`）

- `RandomAffine`（±15°、平移 12%、缩放 0.9–1.1）；
- 自定义 `StrokeWidthJitter`：以 35% 概率随机 max/avg pooling，模拟笔画粗细抖动——针对涂鸦的领域增强。

### 5.3 状态管理（前端 composable）

无 Pinia/Vuex，状态按**领域**拆成 7 个 composable：

`useDrawing`（笔画）· `usePredictions`（识别）· `useContinuation`（续画）·
`useEnhance`（美化）· `useIdentity`（身份）· `useNailongBoard`（彩蛋）。

各 composable 通过**函数参数传入依赖**（如 `getSnapshot`、`getDrawing`）而非直接 import，
便于解耦与测试。

### 5.4 笔画数据模型

每笔记录 `{ id, tool, color, width, startedAt, endedAt, source, points:[{x,y,t}] }`。
橡皮擦也是「白色笔画」，重绘/回放/导出/AI 采纳统一走同一套有序笔画列表，
这是整个前端能被 4 个功能复用而不乱的根基。

---

## 6. 目录结构（本包内容）

```
├── app.py / train.py / download_quickdraw.py   # 入口（转发到 backend/ml）
├── requirements.txt / start-backend.cmd / .gitignore
├── backend/          # FastAPI：main / inference / image_utils / schemas / enhance
├── ml/               # CNN 模型定义、训练、数据下载、classes.json
├── frontend/
│   ├── package.json / vite.config.js / publish.mjs
│   ├── web/          # Vue 源码：components / composables / lib / *.css
│   └── public/static/sketch-rnn/   # worker.js / geometry.js / vendor 运行时
├── docs/             # 设计与本文档
└── artifacts/        # 仅 metrics.json / train_config.json / class_names.json（元数据）
```

---

## 7. 运行与构建

```bash
# 后端
pip install -r requirements.txt
python app.py                      # 或 start-backend.cmd（Windows）

# 前端开发
cd frontend && npm install && npm run dev   # Vite 代理 /api → :8000

# 前端生产构建（改源码后必须执行）
cd frontend && npm run build

# 训练
python download_quickdraw.py && python train.py
```

---

## 8. 已包含与需自行补齐的资产

模型权重与演示素材已随仓库提供：CNN 权重 `artifacts/model.pt`、7 个 SketchRNN 模型（`frontend/public/static/models/sketch-rnn/`）、训练图表 `artifacts/figures/`，以及奶龙演示素材（`frontend/public/static/nailong/`，版权归原 IP 方，仅供学习演示），克隆后即可直接运行演示。

以下内容未包含，按需自行获取：

| 资产 | 位置 | 补齐方式 |
|---|---|---|
| 训练数据 | `artifacts/quickdraw_npy/*.npy` | `python download_quickdraw.py` |
| 前端依赖 | `frontend/node_modules/` | `cd frontend && npm install` |
| Python 环境 | `.venv-runtime/` | `pip install -r requirements.txt` |

---

## 9. 已知局限与改进方向

- 识别仅 20 类、CNN 较浅，复杂涂鸦泛化有限；
- 续画只覆盖 7 类，且是老版 SketchRNN 运行时；
- 0.5s 轮询而非 SSE/WebSocket，实时性够用但非流式；
- 任务状态存内存、重启丢失；无鉴权与持久化（单机演示定位）。

改进方向：识别改更强 backbone；续画迁移到 `@tensorflow/tfjs` 或 ONNX Web；识别改 SSE 推送；
引入 SQLite 持久化身份与任务。
