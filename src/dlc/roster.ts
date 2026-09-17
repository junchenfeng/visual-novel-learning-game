export type RosterWork = {
  title: string;
};

export type RosterPoet = {
  poetId: string;
  poet: string;
  poetPortraitUrl: string;
  works: RosterWork[];
};

export function poetPortrait(poetId: string): string {
  return `/poets/${poetId}.webp`;
}

/** 仓库内置课表。线上名册以 OSS roster.json 为准，首次读取会把这份 seed 写进去。 */
export const SEED_ROSTER: RosterPoet[] = [
  {
    poetId: "libai",
    poet: "李白",
    poetPortraitUrl: poetPortrait("libai"),
    works: [
      { title: "早发白帝城" },
      { title: "闻王昌龄左迁龙标遥有此寄" },
      { title: "独坐敬亭山" },
      { title: "渡荆门送别" },
      { title: "行路难" },
    ],
  },
  {
    poetId: "dufu",
    poet: "杜甫",
    poetPortraitUrl: poetPortrait("dufu"),
    works: [
      { title: "江南逢李龟年" },
      { title: "望岳" },
      { title: "春望" },
    ],
  },
  {
    poetId: "dumu",
    poet: "杜牧",
    poetPortraitUrl: poetPortrait("dumu"),
    works: [
      { title: "江南春" },
      { title: "泊秦淮" },
      { title: "赤壁" },
    ],
  },
  {
    poetId: "sushi",
    poet: "苏轼",
    poetPortraitUrl: poetPortrait("sushi"),
    works: [
      { title: "水调歌头・明月几时有" },
      { title: "西江月・夜行黄沙道中" },
      { title: "江城子・密州出猎" },
      { title: "六月二十七日望湖楼醉书" },
    ],
  },
  {
    poetId: "lishangyin",
    poet: "李商隐",
    poetPortraitUrl: poetPortrait("lishangyin"),
    works: [
      { title: "夜雨寄北" },
      { title: "无题（相见时难别亦难）" },
    ],
  },
  {
    poetId: "wangchangling",
    poet: "王昌龄",
    poetPortraitUrl: poetPortrait("wangchangling"),
    works: [{ title: "出塞" }],
  },
];

/** 兼容旧测试与同步调用；生产目录请用 loadRoster()。 */
export const POET_ROSTER = SEED_ROSTER;
