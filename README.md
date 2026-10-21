# QuickDraw AI Draw Guess

A real-time doodle guessing web app built with FastAPI, PyTorch, and the QuickDraw dataset.  
Users draw on a browser canvas, and the backend preprocesses the sketch into a `28x28` grayscale image for CNN inference.

## Features

- Real-time sketch prediction every 0.5 seconds
- Browser-based drawing board with mouse and touch support
- FastAPI backend for health check, class list, and prediction APIs
- PyTorch CNN model trained on 20 QuickDraw classes
- Included trained model for quick local demo
- Vue 3 前端支持逐笔记录、按顺序重绘，以及 PNG 和笔画 JSON 导出
- 学号和姓名初始为空，可编辑并保存在本机，刷新后恢复
- 第二阶段加入真实 SketchRNN 本地续画：三候选虚线预览、温度调节、快捷键选择与采纳
- 「奶龙点睛」彩蛋：主画板内自动逐笔描边，亲手画上双眼后播放奶龙动图；未放置动图时以静帧回退，退出后恢复原画
- 「AI 美化」：结合当前线稿与 CNN 识别结果生成插画，服务端代理持有 API 令牌，结果可下载或重试

## Model Classes

`apple`, `banana`, `bicycle`, `bird`, `book`, `bus`, `car`, `cat`, `cloud`, `fish`, `house`, `key`, `lightning`, `moon`, `mushroom`, `star`, `sun`, `tree`, `umbrella`, `clock`

## Project Structure

```text
quickdraw_ai_draw_guess/
├── app.py
├── train.py
├── download_quickdraw.py
├── requirements.txt
├── README.md
├── start-backend.cmd
├── backend/
│   ├── config.py
│   ├── enhance.py         # XAIS 图片生成服务端代理（令牌只保存在服务端）
│   ├── image_utils.py
│   ├── inference.py
│   ├── main.py
│   └── schemas.py
├── docs/                  # 设计与阶段说明
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── web/               # Vue 源码
│   │   ├── components/DrawingBoard.vue      # 主画板、奶龙模式入口与叠加层
│   │   ├── components/EnhancePanel.vue      # AI 美化结果面板
│   │   ├── composables/useNailongBoard.js   # 奶龙描边、眼睛判定与媒体播放状态机
│   │   ├── composables/useEnhance.js        # AI 美化轮询、超时、重试与下载
│   │   ├── lib/nailongArt.js                # 奶龙 viewBox、轮廓、主画板映射与媒体路径
│   │   ├── enhance.css                      # AI 美化面板样式
│   │   └── nailong.css                      # 主画板彩蛋样式与 reduced-motion 规则
│   ├── public/static/
│   │   ├── models/sketch-rnn/  # 7 个官方预训练模型
│   │   ├── nailong/            # 静帧、参考图与可选的动图/视频
│   │   └── sketch-rnn/        # Worker、vendor 运行时与第三方来源说明
│   ├── dist/              # 构建中间产物
│   ├── index.html         # 构建后的首页
│   └── static/            # 发布后的 Vue 资源、模型、Worker 与运行时
├── ml/
│   ├── classes.json
│   ├── download_quickdraw.py
│   ├── model.py
│   └── train.py
└── artifacts/
    ├── model.pt
    ├── class_names.json
    ├── train_config.json
    ├── metrics.json
    └── figures/
```

## Quick Start

当前 Windows 工作目录使用独立的 `.venv-runtime` 运行环境，可双击 `start-backend.cmd` 启动识别服务，或在项目根目录运行：

```powershell
.\.venv-runtime\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

保持这个服务运行，再打开前端。若前端早于后端打开，页面会每 3 秒自动重连，无需手动刷新。本机运行环境采用 Python 3.12 与缓存中的 PyTorch 2.13.0，只安装 FastAPI、Uvicorn、NumPy、Pillow、PyTorch 及其运行依赖；原 `requirements.txt`、后端源码与模型权重保持不变。

Recommended Python version: `3.10` or `3.11`

```bash
pip install -r requirements.txt
python app.py
```

Then open:

```text
http://127.0.0.1:8000
```

You can also run it with:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

## 前端开发与构建

前端采用 Vue 3 + JavaScript + Vite，源码在 `frontend/web/`，npm 包和构建配置在 `frontend/`。开发时先在项目根目录运行 `python app.py`，再在另一个终端运行：

```bash
cd frontend
npm install
npm run dev
```

Windows PowerShell 也可使用 `npm.cmd install` 安装依赖。Vite 开发服务将 `/api` 请求代理到 `http://127.0.0.1:8000`。

修改源码后，在 `frontend/` 目录构建：

```bash
npm run build
```

Vite 的源码根目录是 `frontend/web/`，`publicDir` 配置为 `../public`，将本地模型、Worker 和运行时一起复制到 `frontend/dist/static/`。构建脚本随后发布 `dist/index.html` 到 `frontend/index.html`，并将 `dist/static/` 整体发布到 `frontend/static/`，其中 Vue 构建资源仍位于 `static/vue/`。构建后仍从项目根目录运行 `python app.py`，通过原来的 8000 端口打开页面。

续画与 AI 美化沿用已有依赖，不需要新增 npm 包，也没有新增 Python 依赖；AI 美化新增 `/api/enhance` 系列后端接口，使用标准库 `urllib` 调用外部服务。首次安装前端依赖仍需执行上面的 `npm install`。

## 阶段进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 第一阶段 | Vue 3 迁移、逐笔记录与重放、PNG / 笔画 JSON 导出、本机身份保存 | 已完成 |
| 第二阶段 | SketchRNN 本地续画：7 个预训练模型、三候选虚线预览、温度调节、Tab / Enter 操作 | 已完成，已通过 Worker 与浏览器端到端验证 |
| 扩展 | AI 美化：线稿 + 识别结果生成插画，服务端令牌代理、结果下载与重试 | 已完成，已通过浏览器端到端验证 |
| 第三阶段 | 完整笔画播放动画与视频录制 | 未开始 |

## 第二阶段：SketchRNN 离线辅助续画

第一阶段完成了逐笔记录、PNG / JSON 导出与本机身份保存；第二阶段在此基础上接入真实 SketchRNN 预训练模型，在浏览器的 classic Web Worker 中进行续画采样。

已下载 7 个官方小型生成模型，每个约 3 MB，存放在 `frontend/public/static/models/sketch-rnn/`。支持 `bicycle`、`bird`、`book`、`bus`、`cat`、`key` 和 `clock`；其中 `clock` 使用 `alarm_clock` 模型近似续画。其余 13 个 CNN 识别类别没有配置续画模型，界面会显示暂无模型，不会生成模拟候选。

使用方式：

1. 打开画板下方的 AI 续画开关，画出物体的开头。
2. 每笔完成后，系统依据 CNN 的最高概率结果判断是否续画：概率须达到 `0.65`，连续两次识别为同一类别，且结果匹配最新画板版本。符合条件并有对应模型时，自动生成 3 个候选。
3. 画板只显示当前选中的候选虚线，候选按钮用紫、青、橙三色区分，点击即可切换预览。预览独立于正式 canvas，未采纳的虚线不会进入 PNG 或笔画 JSON；开始新的一笔会清除候选。
4. 点击候选按钮选择方案，也可在画布获得焦点时使用 `Tab` / `Shift+Tab` 前后切换，按 `Enter` 采纳。可用 `0.15`～`0.85` 的温度滑块调整采样变化，并点击“重新生成”。
5. 采纳后的路径写入正式笔画列表，标记为 `source: 'ai'`，随后参与重绘与导出。

输入笔画经过橡皮擦有效路径处理，再进行 RDP 简化（参数 `2`）和 `280 → 256` 坐标转换；采样结果按用户画幅等比缩放、限制在画板范围内，再经逆变换回到画板的 `280 × 280` 坐标。坐标变换可逆，具体笔状态、路径处理和采样逻辑以 `frontend/public/static/sketch-rnn/worker.js` 为准。

Worker 从同源路径 `/static/sketch-rnn/worker.js` 加载，旧版 SketchRNN 运行时与 NumJS 位于 `frontend/public/static/sketch-rnn/vendor/`。模型和运行时均从本地静态资源加载；这里的“离线”指续画无需访问外部模型服务，CNN 识别仍需要原 Python 后端在 `8000` 端口运行。

第三方来源、模型下载地址和许可说明见 [THIRD_PARTY.md](frontend/public/static/sketch-rnn/THIRD_PARTY.md)。完整笔画播放动画与视频录制留待后续阶段。

## 奶龙点睛彩蛋（本地演示）

画板标题栏的「奶龙点睛」入口会直接在原来的主画板内进入奶龙模式，不再打开独立页面。进入时先保存并清空当前画作，奶龙以黑白简笔画的形式自动逐笔描出轮廓；点击「一键成形」或直接在画板上落笔，都可以跳过描边，立即得到待点睛的奶龙。轮廓成形后，用主画板画笔在两只眼睛的虚线圈里各点一下，两只眼睛都完成后，奶龙自动“活过来”，静帧或动图直接覆盖在同一块主画板区域。

- 只完成一只眼睛不会触发动画；画到圈外的笔画会保留，但不计入眼睛进度。奶龙线稿不包含怀里的小猫，肚子中间保持干净。
- 「帮我点睛」可一键完成双眼，方便键盘和触屏用户。
- 「再看一次」重播媒体；「重来」清空眼睛笔迹并重新描边；点击「退出」、再次点击标题栏入口，或在画布聚焦时按 `ESC`，都会退出并恢复进入前的原画、工具、颜色和粗细。
- 奶龙线稿是主画板之上的 `pointer-events: none` SVG 叠加层，不会写入 `useDrawing`，因此不会进入 CNN 输入、PNG/JSON 导出或续画数据。眼睛笔迹使用真实主画板画笔，但只属于本次彩蛋，退出时丢弃。
- 奶龙模式期间暂停 CNN 识别轮询、隐藏续画面板，并暂时隐藏导出与清空按钮，避免导出只有眼睛的空白图或误删保存的原画。

### 动画素材

仓库已内置奶龙素材（`nailong-alive.mp4`、`nailong-still.webp`、`nailong-reference.webp`），构建后即可播放。若要替换为自己的素材，在 `frontend/public/static/nailong/` 放入以下任意一个文件；同名文件按顺序优先探测：

| 顺序 | 文件名 | 类型 |
| --- | --- | --- |
| 1 | `nailong-alive.webm` | 视频 |
| 2 | `nailong-alive.mp4` | 视频 |
| 3 | `nailong-alive.webp` | 动态 WebP |
| 4 | `nailong-alive.gif` | GIF |

然后重新构建：

```bash
cd frontend
npm run build
```

构建会把素材复制到 `frontend/static/nailong/`，不需要修改代码。视频会自动静音、循环、内联播放；GIF / 动态 WebP 直接循环。建议画幅为 3:4、静音、无缝循环；GIF 控制在 5 MB 以内，视频 8 MB 以内。

未放置动图、探测失败或解码失败时，会回退到 `nailong-still.webp` 静帧（轻晃）；静帧也不可用时保留轮廓并做呼吸动画，不会出现破图。开启“减少动态效果”时，描边直接完成，静帧不晃动，也不会自动播放动图，需要点击「播放动画」手动开始。

奶龙相关素材（`nailong-alive.mp4`、`nailong-reference.webp`、`nailong-still.webp`）由用户提供的奶龙图片/视频提取，仅用于课程学习演示，请勿商用。后端在 `backend/main.py` 中注册了 `.webp` MIME 类型，避免 Windows 下静态资源被当作 `text/plain` 返回。

## AI 美化（服务端代理）

画板工具行新增「AI 美化」按钮，画板上有笔画后可用。点击后，前端把当前画布 PNG 与 CNN 当前最高概率类别（英文标签与中文名）提交给后端；后端上传参考图、启动 XAIS 图片生成任务并轮询，生成结果缓存在内存中，再通过同源 `/api/enhance/{task_id}/image` 返回。结果面板位于主画板与续画面板之间，可「下载图片」「再来一张」或「收起」，收起不会清空画作。

- 提示词以当前识别结果为主题，要求保留线稿的物种、姿态与构图，转为完整配色、干净背景、正方形构图的插画；不使用参考图之外的文字、纸张、照片边框或水印。
- 只有后端持有 API 令牌。令牌读取顺序为环境变量 `XAIS_TOKEN`，或 `backend/.xais-token` 文件（已加入 `.gitignore`）。前端源码、构建产物和日志都不包含令牌。
- 同一时间只允许一个生成任务，避免重复点击消耗额度；结果在内存中保留 30 分钟，单个任务最多等待 240 秒，超时或上游报错时面板显示错误与「重试」。生成过程中点击「收起」会释放单任务占位，不必等待超时即可重新生成。
- 当前线稿会被发送到外部图片生成服务，面板底部也做了提示。仅在需要生成时点击按钮，不要上传敏感内容。

### 配置

令牌只保存在本机，二选一：

```powershell
# 环境变量
$env:XAIS_TOKEN = "你的令牌"
```

```powershell
# 或写入仅本机可见的文件（推荐，重启后仍有效）
Set-Content -Path backend/.xais-token -Value "你的令牌" -NoNewline
```

必填环境变量：`XAIS_BASE`（图片生成服务地址，无内置默认值）、`XAIS_MODEL`（生成模型名）。三者均需在启动前配置，修改后需重启后端。未配置令牌或地址时接口返回 `503`，页面会提示生成失败，不影响画板、识别和续画。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/enhance` | 提交 `image_b64`、`label`、`label_name`，返回 `task_id` |
| `GET` | `/api/enhance/{task_id}` | 查询状态：`pending` / `done` / `error`，含进度与错误信息 |
| `DELETE` | `/api/enhance/{task_id}` | 放弃尚未完成的任务并释放单任务占位，返回 `204` |
| `GET` | `/api/enhance/{task_id}/image` | 返回生成图片字节，仅任务完成后可用 |

## 笔画数据与身份信息

画板以 280 × 280 逻辑坐标记录每一笔，导出结构如下（字段示意）：

```js
{
  version: 1,
  canvas: { width: 280, height: 280 },
  strokes: [{
    id, tool, color, width, startedAt, endedAt, source,
    points: [{ x, y, t }]
  }]
}
```

`tool` 为 `brush` 或 `eraser`；橡皮擦作为有序操作保留，重绘时按记录顺序绘制白色路径。AI 采纳笔画的 `source` 为 `'ai'`。`startedAt`、`endedAt` 为毫秒时间戳，点的 `t` 为相对本笔开始的毫秒数。PNG 导出画布图像，JSON 导出笔画数据，两者均不包含身份信息。

身份卡片默认学号、姓名为空；通过「编辑」可填写，保存后使用 localStorage 键 `quickdraw-identity` 在本机保存并于刷新后恢复。

### 当前画面的两次确认

每次画面版本变化后重新计算稳定次数。最高概率达到 65% 时，同一画面会在下一个 500 ms 周期补一次确认；连续两次同类后停止重复请求并生成续画。低置信度或空白画面等待新笔画，不持续请求相同图像。

## Retraining

The repository does not include the raw QuickDraw `.npy` files because they are too large for a normal GitHub repo.  
If you want to retrain the model:

```bash
python download_quickdraw.py
python train.py
```

This will generate or update:

- `artifacts/model.pt`
- `artifacts/class_names.json`
- `artifacts/train_config.json`
- `artifacts/metrics.json`
- `artifacts/figures/*.png`

## API

### `GET /api/health`

```json
{
  "status": "ok",
  "model_loaded": true
}
```

### `GET /api/classes`

Returns the list of supported classes.

### `POST /api/predict`

Request:

```json
{
  "image_b64": "data:image/png;base64,...",
  "top_k": 5
}
```

Response:

```json
{
  "predictions": [
    {
      "label": "apple",
      "prob": 0.88
    }
  ],
  "is_blank": false,
  "guessed": true,
  "latency_ms": 35.7
}
```

## Training Result

Current metrics from `artifacts/metrics.json`:

| Metric | Value |
| --- | --- |
| Best validation accuracy | `0.9065` |
| Test accuracy | `0.9076` |
| Mean inference latency | `0.1205 ms` |

## Notes

- The trained model is included for demo use
- Raw training data is intentionally excluded from GitHub
- The current frontend uses `frontend/`, not the old `templates/` or root `static/`
