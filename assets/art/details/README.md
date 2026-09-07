# 细部照 —— 一幅画一个文件夹

展览里拍回来的照片放这儿。一幅画一个文件夹，文件夹名用 ASCII，
理由跟 `add_art.py` 里那条一样：中文文件名进 URL 要转义，跨系统也容易出岔子。
画名照旧记在 `painting.json` 里，不靠文件夹名认人。

    details/
      <画的 slug>/
        painting.json    这是哪幅画、底图是哪张、在哪个展览拍的
        photos/          你直出的原片，原文件名别改   ← 不进版本库
        web/             缩过的派生图，页面上用的就是这些   ← 进版本库
        regions.json     配准结果：每张照片落在底图的哪一块（将来由脚本生成）
      _inbox/            还没分到哪幅画名下的照片   ← 不进版本库

## 先说要紧的：`photos/` 不进版本库

`.gitignore` 里把 `photos/` 和 `_inbox/` 挡掉了。手机直出一张三五兆，
一场展览拍两百张就是一个 G —— 进了 git history 就永远在里面，
每次 clone 都得拖一遍，而且删不干净（要重写历史）。

**所以：这儿不是备份。原片自己另存一份**（外置盘、网盘、随便哪儿）。
版本库里只留 `web/` 下缩过的派生图。

想改这个决定，`.gitignore` 里删掉那两行就行 —— 现在挡着是因为，
挡了随时能放开，放进去了却很难拿出来。

## 怎么加一幅画

    mkdir -p assets/art/details/<slug>/photos
    cp ~/展览/那批照片/*.jpg assets/art/details/<slug>/photos/

再照着 `qianli-jiangshan/painting.json` 写一份 `painting.json`：

| 字段 | 说明 |
|---|---|
| `slug` | 跟文件夹名一致 |
| `title` `artist` `dynasty` `credit` | 画名、画家、年代、藏处。用词跟 `index.json` 保持一致 |
| `poem` | 这幅画若已配给某一篇，写那篇的 id；没有就留空 |
| `base.file` | 底图路径，从仓库根算起 |
| `base.w` `base.h` | 底图像素尺寸 |
| `base.whole` | 底图是整幅还是局部。局部的话，落区坐标只在这一块里说得通 |
| `exhibition` | 展名、馆、拍摄日期。将来照片旁要印一行出处 |
| `photos` | 先留空数组，配准脚本回填 |


`qianli-jiangshan/` 是照着站上已有的那幅画建的样板，摆在这儿是为了让
约定有个实物可看。要是这次展览没拍它，整个文件夹删掉就是。

## 分不清是哪幅画的，先扔 `_inbox/`

不用当场分类。原片的 EXIF 里有拍摄时间，同一幅画的照片必然挨在一起，
将来脚本可以按时间先聚成堆，你再认哪堆是哪幅。

## 接下来

把照片钉回画上（点画上一处，弹出对应的细部照）要怎么做，
以及同一处有好几张不同倍率的照片时怎么叠 —— 写在 `docs/painting-details-plan.md`。
现在这一步只管把照片收进来。
