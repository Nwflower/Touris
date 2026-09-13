# 预设身份头像署名

预设身份（林小满 / 陈铁腿 / 周晚晚）的头像不是景点配图，所以**没有**进
`tools/image-sources.json`，也**不由** `tools/fetch-images.js` 生成——
这个文件是手写的，换头像时一起改这里。

三张都是 Commons 上 Unsplash 捐赠的 **CC0** 图（公有领域，无署名义务，这里照样记上），
且都是**背影 / 剪影，不指向可识别的人**：拿真人正脸照去当虚构人设的头像，
图库许可只解决著作权，解决不了人格权。

本地文件是 Commons 原图的 400px 缩略图（头像最大只显示到 20px 上下）；
取图用 `node tools/_avatar-get.js <输出目录> "File:<Commons 文件名>"`。

| 本地文件 | 用于 | 原图（Commons） | 许可 | 作者 |
| --- | --- | --- | --- | --- |
| `persona-demo.jpg` | 林小满 · 慢节奏 | [Woman walking through waves (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Woman_walking_through_waves_%28Unsplash%29.jpg) | CC0 | Killian Pham |
| `persona-iron.jpg` | 陈铁腿 · 特种兵 | [Backpacker at sunset (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Backpacker_at_sunset_%28Unsplash%29.jpg) | CC0 | Vitaly |
| `persona-eve.jpg` | 周晚晚 · 傍晚散步 | [Silhouette woman standing sunset (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Silhouette_woman_standing_sunset_%28Unsplash%29.jpg) | CC0 | freestocks.org |

游客（未选身份）**不给照片**，保持 `🫥`——那一档是「0 记忆 · 不落盘」，
没有档案就不该有脸。
