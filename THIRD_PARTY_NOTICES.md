# 第三方軟體聲明

## PaddleOCR Python service（尚未部署）

- 用途：`cloud-ocr-service/` 的選用伺服器端圖片文字辨識。
- 版本：3.7.0
- 授權：Apache License 2.0
- 專案：https://github.com/PaddlePaddle/PaddleOCR

## pinyin-pro

- 用途：在使用者裝置內把中文查詢轉成拼音，提供同音、拼音與注音搜尋建議。
- 版本：3.18.2
- 授權：MIT License
- 專案：https://github.com/zh-lx/pinyin-pro

本專案使用的 `pinyin-pro.js` 由套件的瀏覽器版本原樣納入，搜尋內容不會因此傳送至第三方服務。

### MIT License

Copyright (c) 2022-present zh-lx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## PaddleOCR.js

- 用途：在使用者瀏覽器內執行 PP-OCRv6 tiny 文字偵測與辨識，將照片轉成待人工確認的文字草稿；照片會先縮小以降低行動裝置記憶體用量。
- 版本：`@paddleocr/paddleocr-js` 0.4.2
- 授權：Apache License 2.0
- 專案：https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js

PaddleOCR.js、其依賴的 ONNX Runtime Web 與官方模型只在使用者主動啟動圖片辨識時載入；照片不會送往第三方辨識服務。完整 Apache License 2.0 條款可於上游專案與套件中查閱。
