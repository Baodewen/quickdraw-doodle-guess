# SketchRNN 第三方资源

本目录使用 Magenta 官方旧版 Sketch-RNN-JS 运行时、NumJS 和官方预训练生成模型。它们作为本地静态文件供 classic Web Worker 加载，没有添加新的 npm 依赖。

## 官方预训练模型

模型发布说明见 Magenta 官方的 [Magenta.js Sketch 文档](https://github.com/magenta/magenta-js/blob/master/sketch/README.md#pre-trained-models)和 [Sketch-RNN-JS 文档](https://github.com/magenta/magenta-demos/tree/main/sketch-rnn-js)；项目介绍见 [Draw Together with a Neural Network](https://magenta.tensorflow.org/sketch-rnn-demo)。本项目使用官方 `sketchRNN/models/` 路径下的 `.gen.json` 小型生成模型，已下载至 `frontend/public/static/models/sketch-rnn/`，每个约 3 MB。以下记录实际下载地址。

| CNN 类别 | 本地文件 | 官方下载地址 |
| --- | --- | --- |
| `bicycle` | `bicycle.gen.json` | [bicycle.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/bicycle.gen.json) |
| `bird` | `bird.gen.json` | [bird.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/bird.gen.json) |
| `book` | `book.gen.json` | [book.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/book.gen.json) |
| `bus` | `bus.gen.json` | [bus.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/bus.gen.json) |
| `cat` | `cat.gen.json` | [cat.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/cat.gen.json) |
| `key` | `key.gen.json` | [key.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/key.gen.json) |
| `clock` | `alarm_clock.gen.json` | [alarm_clock.gen.json](https://storage.googleapis.com/quickdraw-models/sketchRNN/models/alarm_clock.gen.json) |

`clock` 是项目 CNN 的“时钟”类别，续画使用官方 `alarm_clock`（闹钟）模型进行近似映射，并非独立的 `clock` 模型。其他 13 个识别类别未配置续画模型，不使用伪造或模拟模型替代。

模型权重的使用条款请查阅上述官方发布页面及其关联说明。本项目不为这些模型权重另行声明许可证，也不将运行时代码的许可证直接视作模型许可证。

## Sketch-RNN-JS 运行时

- 本地文件：`vendor/sketch_rnn.js`。
- 官方来源：[magenta/magenta-demos — sketch-rnn-js](https://github.com/magenta/magenta-demos/tree/main/sketch-rnn-js)。
- 上游代码许可证：Apache License 2.0，随附全文见 [vendor/MAGENTA-LICENSE](vendor/MAGENTA-LICENSE)。

运行时由本地 `/static/sketch-rnn/worker.js` 加载，使用预训练权重进行真实的循环神经网络推理与概率采样。

## NumJS

- 本地文件：`vendor/numjs.js`，供旧版 Sketch-RNN-JS 数值运算使用。
- 官方项目：[nicolaspanel/numjs](https://github.com/nicolaspanel/numjs)。
- 上游代码许可证：MIT，随附全文见 [vendor/NUMJS-LICENSE](vendor/NUMJS-LICENSE)。

构建时，`frontend/public/static/` 下的资源随 Vite 输出进入 `frontend/dist/static/`，随后整体发布到 `frontend/static/`。运行时和权重均由本机服务器提供，无需从 CDN 或外部模型服务加载。
