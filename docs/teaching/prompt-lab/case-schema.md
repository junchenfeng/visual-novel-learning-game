# 作答轨迹 YAML

三份案例和以后从线上下载的黄金集，都用这一套字段（**只有课堂 quiz**）。本机开发环境自动保存的完整对局是另一套，见 [作业总览](../README.md)，里面有故事，但没有读诗、没有彩蛋。

路径：`docs/teaching/prompt-lab/cases/<pack-id>/`

水调歌头现在有三份：

| 文件 | `id` | 画像 |
| --- | --- | --- |
| `all-correct.yaml` | `all-correct` | 每题一次就对 |
| `one-miss.yaml` | `one-miss` | 第二题（婵娟）先点错再点对，其余一次对 |
| `guess-abc.yaml` | `guess-abc` | 按卷面顺序点到对为止（第三题第一项就是对的，所以这题和全对一样） |

## 顶层

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schemaVersion` | 是 | 目前必须是 `1` |
| `id` | 是 | 案例短 id，字母数字短横线 |
| `label` | 是 | 给人看的画像名 |
| `questions` | 是 | 按答题顺序，至少 1 题 |

`questions[].questionId` 必须能在对应 DLC 的 `quiz.yaml` 里找到。`type` 必须和那道题一致。

## 选择题

```yaml
- questionId: q_separate
  type: choice
  optionIds:
    - wutai_huangzhou   # 先点的（错）
    - reform_exile      # 后点的（对）才停
```

`optionIds` 是**作答顺序**，不是选项在卷面上的排列。数组最后一项应是最终留下的答案。选项 id 必须是那道题 `options[].id`。

卷面顺序（A / B / C）以 `quiz.yaml` 里 `options` 的排列为准。`guess-abc` 就是按这个顺序点到正解为止。

## 填空题

作业把 `q_theme` 改成 `type: open` 之后才会用到。字段长这样：

```yaml
- questionId: q_theme
  type: open
  texts:
    - 月亮好看就行吧
    - 分开就分开呗
```

`texts` 同样是提交顺序。可以只写一条，也可以写多次改写。

## 和游戏的关系

选择题必须答对才能下一题，所以**只看最后一答的话，三种画像都会变成全对**。总评以后要能批评「挨个点选项」，必须读完整条 `optionIds` / `texts` 轨迹。
