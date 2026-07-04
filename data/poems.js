/*
 * 诗文数据 — 种子数据集 (seed dataset)
 * ------------------------------------------------------------
 * 每一条作品的数据结构 (schema)，为扩充至“每一首已知古诗古文”而设计：
 *
 *   id            唯一标识
 *   title         标题
 *   author        作者（“佚名”表示作者不详）
 *   dynasty       朝代
 *   dynastyOrder  朝代排序权重（用于按时代排列）
 *   year          创作年份（约数，公元；公元前为负数）— 用于时间轴
 *   yearLabel     年份的人类可读标签
 *   form          体裁 / 格律（如 五言绝句、词·水调歌头、诗经·风）
 *   genre         大类：诗 / 词 / 曲 / 文 / 赋
 *   themes        主题标签（数组）
 *   place         创作地点 { name, modern, lat, lng }（lat/lng 为约略坐标）
 *   text          原文（每行以 \n 分隔）
 *   pinyin        拼音，与 text 逐行对应（每行音节以空格分隔）；可缺省
 *   translation   白话译文
 *   notes         注释 [{ term, explain }]
 *   appreciation  赏析
 *   english       英文翻译
 *   englishBy     英译者（若为整理/意译则注明）
 */

window.DYNASTIES = [
  { key: "先秦",   order: 1,  span: "上古 – 前221" },
  { key: "汉",     order: 2,  span: "前202 – 220" },
  { key: "魏晋",   order: 3,  span: "220 – 420" },
  { key: "南北朝", order: 4,  span: "420 – 589" },
  { key: "隋",     order: 5,  span: "581 – 618" },
  { key: "唐",     order: 6,  span: "618 – 907" },
  { key: "五代",   order: 7,  span: "907 – 960" },
  { key: "宋",     order: 8,  span: "960 – 1279" },
  { key: "元",     order: 9,  span: "1271 – 1368" },
  { key: "明",     order: 10, span: "1368 – 1644" },
  { key: "清",     order: 11, span: "1644 – 1912" }
];

window.POEMS = [
  {
    id: "guanju",
    title: "关雎",
    author: "佚名",
    dynasty: "先秦",
    dynastyOrder: 1,
    year: -700,
    yearLabel: "西周—春秋（约公元前 8 世纪）",
    form: "诗经·国风·周南",
    genre: "诗",
    themes: ["爱情", "民歌", "礼乐"],
    place: { name: "周南", modern: "今河南洛阳一带", lat: 34.62, lng: 112.45 },
    text: "关关雎鸠，在河之洲。\n窈窕淑女，君子好逑。\n参差荇菜，左右流之。\n窈窕淑女，寤寐求之。\n求之不得，寤寐思服。\n悠哉悠哉，辗转反侧。",
    pinyin: "guān guān jū jiū ， zài hé zhī zhōu 。\nyǎo tiǎo shū nǚ ， jūn zǐ hǎo qiú 。\ncēn cī xìng cài ， zuǒ yòu liú zhī 。\nyǎo tiǎo shū nǚ ， wù mèi qiú zhī 。\nqiú zhī bù dé ， wù mèi sī fú 。\nyōu zāi yōu zāi ， zhǎn zhuǎn fǎn cè 。",
    translation: "关关和鸣的雎鸠，栖息在河中的小洲。美好文静的姑娘，是君子的好配偶。长短不齐的荇菜，在水中左右采摘。美好文静的姑娘，我日夜都在追求。追求却得不到，日夜思念难安。思念绵绵不尽，翻来覆去难以入眠。",
    notes: [
      { term: "雎鸠 (jū jiū)", explain: "一种水鸟，古人以为雌雄有固定配偶，故以起兴，象征专一的爱情。" },
      { term: "窈窕 (yǎo tiǎo)", explain: "文静美好的样子。" },
      { term: "好逑 (hǎo qiú)", explain: "好的配偶。逑，配偶。" },
      { term: "荇菜 (xìng cài)", explain: "一种可食的水生植物。" },
      { term: "寤寐 (wù mèi)", explain: "寤，醒着；寐，睡着。指日日夜夜。" }
    ],
    appreciation: "《关雎》居《诗经》之首，是华夏第一首情诗。全篇以“比兴”开篇——先言雎鸠之和鸣，再引出君子对淑女的爱慕，情景交融，含蓄而不轻佻。“求之不得，寤寐思服”写尽相思的辗转，“辗转反侧”四字尤为传神。孔子评之“乐而不淫，哀而不伤”，正是儒家中和之美的典范，两千余年来奠定了中国抒情诗的基调。",
    english: "\"Guan-guan\" cry the ospreys / on the islet in the river. / A gentle, graceful maiden — / a fitting match for the noble man. / Uneven float the water plants, / left and right we gather them. / A gentle, graceful maiden — / waking and sleeping he longs for her. / He longs but cannot win her; / waking and sleeping he thinks of her, / on and on, endlessly — / tossing and turning, he cannot rest.",
    englishBy: "编者译"
  },

  {
    id: "yinjiu5",
    title: "饮酒·其五",
    author: "陶渊明",
    dynasty: "魏晋",
    dynastyOrder: 3,
    year: 417,
    yearLabel: "东晋 约 417 年",
    form: "五言古诗",
    genre: "诗",
    themes: ["田园", "隐逸", "哲理"],
    place: { name: "浔阳柴桑", modern: "今江西九江", lat: 29.62, lng: 115.95 },
    text: "结庐在人境，而无车马喧。\n问君何能尔？心远地自偏。\n采菊东篱下，悠然见南山。\n山气日夕佳，飞鸟相与还。\n此中有真意，欲辨已忘言。",
    pinyin: "jié lú zài rén jìng ， ér wú chē mǎ xuān 。\nwèn jūn hé néng ěr ？ xīn yuǎn dì zì piān 。\ncǎi jú dōng lí xià ， yōu rán jiàn nán shān 。\nshān qì rì xī jiā ， fēi niǎo xiāng yǔ huán 。\ncǐ zhōng yǒu zhēn yì ， yù biàn yǐ wàng yán 。",
    translation: "把房子建在人来人往之处，却听不到车马的喧闹。要问我怎能如此？只因心境高远，住处自然就偏静了。在东篱下采摘菊花，悠然间望见了南山。山间雾气在傍晚格外美好，飞鸟结伴归巢。这其中蕴含着人生的真意，想要辨说，却已忘了该如何言语。",
    notes: [
      { term: "人境", explain: "人聚居的地方。" },
      { term: "尔 (ěr)", explain: "如此、这样。" },
      { term: "心远地自偏", explain: "心远离世俗，住处自然显得僻静。全诗诗眼所在。" },
      { term: "悠然", explain: "闲适自得的样子。一作“悠然望南山”，苏轼力主“见”字更佳，无意而得，境界全出。" },
      { term: "真意", explain: "自然与人生的真谛。" }
    ],
    appreciation: "此诗是中国田园诗的巅峰。前四句以“心远”二字破题——真正的宁静不在山林，而在内心。“采菊东篱下，悠然见南山”更是千古名句：一个“见”字全然无心，人与南山不期而遇，物我两忘。末二句“此中有真意，欲辨已忘言”直指道家“得意忘言”之境——真意一旦落入言诠便已失真。陶渊明以最朴素的语言写出了最深的哲思，开启了后世王维、孟浩然的山水田园一脉。",
    english: "I built my hut amid the throng of men, / yet hear no noise of horse and carriage. / You ask how this can be? / When the heart is distant, the place grows remote of itself. / Picking chrysanthemums by the eastern hedge, / at ease, I catch sight of the southern hills. / The mountain air is lovely at dusk; / the birds, in company, return. / In all this there is a real meaning — / I would explain, but have forgotten the words.",
    englishBy: "编者译"
  },

  {
    id: "chunxiao",
    title: "春晓",
    author: "孟浩然",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 730,
    yearLabel: "盛唐 约 730 年",
    form: "五言绝句",
    genre: "诗",
    themes: ["田园", "春天", "惜时"],
    place: { name: "鹿门山", modern: "今湖北襄阳", lat: 32.00, lng: 112.14 },
    text: "春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。",
    pinyin: "chūn mián bù jué xiǎo ， chù chù wén tí niǎo 。\nyè lái fēng yǔ shēng ， huā luò zhī duō shǎo 。",
    translation: "春夜酣睡，不知不觉天就亮了，醒来处处听见鸟儿啼鸣。回想昨夜一阵风雨，不知吹落了多少花朵。",
    notes: [
      { term: "不觉晓", explain: "不知不觉天已亮。晓，天刚亮。" },
      { term: "啼鸟", explain: "鸟鸣。" },
      { term: "知多少", explain: "不知有多少，含无限惋惜与怅惘。" }
    ],
    appreciation: "二十字写尽春意与人情。诗人不写眼前之景，而从听觉落笔：闻鸟声而知天晓，忆风雨而念落花。由喜春到惜春，情绪一转，含蓄悠远。末句“花落知多少”以问作结，余味无穷——既有对春光易逝的淡淡惆怅，也有顺其自然的从容。清新自然，天籁一般，是唐人绝句中“羚羊挂角、无迹可求”的典范。",
    english: "Asleep in spring, unaware of the dawn, / everywhere I hear the singing birds. / Last night came the sound of wind and rain — / how many blossoms, I wonder, have fallen?",
    englishBy: "编者译"
  },

  {
    id: "denggque",
    title: "登鹳雀楼",
    author: "王之涣",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 704,
    yearLabel: "盛唐 约 704 年",
    form: "五言绝句",
    genre: "诗",
    themes: ["登临", "哲理", "壮阔"],
    place: { name: "鹳雀楼", modern: "今山西永济（古蒲州）", lat: 34.87, lng: 110.44 },
    text: "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。",
    pinyin: "bái rì yī shān jìn ， huáng hé rù hǎi liú 。\nyù qióng qiān lǐ mù ， gèng shàng yī céng lóu 。",
    translation: "太阳依傍着群山落下，黄河朝着大海奔流。想要看尽千里之外的风光，就要再登上更高的一层楼。",
    notes: [
      { term: "鹳雀楼", explain: "古楼名，故址在今山西永济，因常有鹳雀栖息得名，下临黄河。" },
      { term: "白日依山尽", explain: "夕阳靠着远山渐渐沉没。" },
      { term: "穷千里目", explain: "看尽千里之外。穷，尽。" },
      { term: "更上一层楼", explain: "再登高一层。后成为激励进取、追求更高境界的千古格言。" }
    ],
    appreciation: "前两句写景，一“依”一“入”，把落日、群山、黄河、大海纳入十字之中，气象雄浑，尺幅千里。后两句由景入理：“欲穷千里目，更上一层楼”——站得越高，看得越远。景与理浑然天成，毫无说教之感，却道出了人生进取的普遍真理。全诗对仗工整而气势流走，是盛唐气象的缩影，也是最广为传诵的哲理名句之一。",
    english: "The white sun sinks behind the mountains, / the Yellow River flows on to the sea. / To stretch your gaze a thousand miles, / climb one storey higher still.",
    englishBy: "编者译"
  },

  {
    id: "xiangsi",
    title: "相思",
    author: "王维",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 740,
    yearLabel: "盛唐 约 740 年",
    form: "五言绝句",
    genre: "诗",
    themes: ["相思", "友情", "咏物"],
    place: { name: "长安", modern: "今陕西西安", lat: 34.27, lng: 108.95 },
    text: "红豆生南国，春来发几枝。\n愿君多采撷，此物最相思。",
    pinyin: "hóng dòu shēng nán guó ， chūn lái fā jǐ zhī 。\nyuàn jūn duō cǎi xié ， cǐ wù zuì xiāng sī 。",
    translation: "红豆生长在南方，春天来了会抽出多少新枝呢？希望你多多采摘，因为它最能寄托相思之情。",
    notes: [
      { term: "红豆", explain: "又名相思子，产于岭南，色红艳，古人用以象征相思。" },
      { term: "南国", explain: "南方。" },
      { term: "采撷 (cǎi xié)", explain: "采摘。" },
      { term: "相思", explain: "此诗一题《江上赠李龟年》，或为怀友之作，“相思”不限于男女之情。" }
    ],
    appreciation: "王维以物起兴，借南国红豆写深挚的思念。全诗不着一“情”字，却字字含情：由红豆之“生”，到春日之“发”，到劝人之“采”，到点明之“相思”，层层递进，自然天成。“愿君多采撷”看似寻常叮咛，实则将无形的思念托于有形之物，含蓄蕴藉。相传盛唐时此诗被谱曲传唱，是唐人绝句中言浅意深、老少能诵的极品。",
    english: "Red beans grow in the southern land; / how many sprigs will spring bring forth? / Gather them, gather them, I pray you — / no thing so speaks of longing.",
    englishBy: "编者译"
  },

  {
    id: "songdu",
    title: "送杜少府之任蜀州",
    author: "王勃",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 676,
    yearLabel: "初唐 约 676 年",
    form: "五言律诗",
    genre: "诗",
    themes: ["送别", "友情", "壮阔"],
    place: { name: "长安", modern: "今陕西西安", lat: 34.27, lng: 108.95 },
    text: "城阙辅三秦，风烟望五津。\n与君离别意，同是宦游人。\n海内存知己，天涯若比邻。\n无为在歧路，儿女共沾巾。",
    pinyin: "chéng què fǔ sān qín ， fēng yān wàng wǔ jīn 。\nyǔ jūn lí bié yì ， tóng shì huàn yóu rén 。\nhǎi nèi cún zhī jǐ ， tiān yá ruò bǐ lín 。\nwú wéi zài qí lù ， ér nǚ gòng zhān jīn 。",
    translation: "长安的城郭为三秦之地所护卫，透过风烟遥望蜀地的五个渡口。和你离别，心中有无限情意，因为我们同是在外漂泊求仕的人。只要四海之内还有知心的朋友，纵使远在天边也如同近邻。不要在分手的岔路口，像小儿女那样泪湿衣巾。",
    notes: [
      { term: "少府", explain: "官名，县尉的别称。之任，前往就职。" },
      { term: "城阙辅三秦", explain: "以三秦之地拱卫长安。三秦，指关中一带。" },
      { term: "五津", explain: "岷江上的五个渡口，代指蜀州（今四川）。" },
      { term: "宦游人", explain: "为求官而离乡在外奔波的人。" },
      { term: "比邻", explain: "近邻。" },
      { term: "无为", explain: "不要。歧路，岔路，指分别之处。" }
    ],
    appreciation: "这是送别诗的千古绝唱，一扫六朝以来送别的悲切缠绵。“海内存知己，天涯若比邻”一联，气度恢弘，把离愁化为豪情——真正的友情不因距离而减损。尾联更以“无为在歧路，儿女共沾巾”劝勉友人不必作小儿女态，格调高昂。王勃以初唐少年之笔，写出了盛唐将至的开阔胸襟，此联至今仍是赠别、共勉的常用语。",
    english: "The walls of Chang'an guard the land of Qin; / through wind and mist I gaze toward the Five Fords. / In this parting we share one feeling — / both of us officials, wandering far from home. / Within the Four Seas a true friend remains; / though at the sky's edge, he is near as a neighbor. / So let us not, at the forking road, / like children, wet our kerchiefs with tears.",
    englishBy: "编者译"
  },

  {
    id: "chunwang",
    title: "春望",
    author: "杜甫",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 757,
    yearLabel: "盛唐 757 年（安史之乱中）",
    form: "五言律诗",
    genre: "诗",
    themes: ["战乱", "忧国", "思亲"],
    place: { name: "长安", modern: "今陕西西安", lat: 34.27, lng: 108.95 },
    text: "国破山河在，城春草木深。\n感时花溅泪，恨别鸟惊心。\n烽火连三月，家书抵万金。\n白头搔更短，浑欲不胜簪。",
    pinyin: "guó pò shān hé zài ， chéng chūn cǎo mù shēn 。\ngǎn shí huā jiàn lèi ， hèn bié niǎo jīng xīn 。\nfēng huǒ lián sān yuè ， jiā shū dǐ wàn jīn 。\nbái tóu sāo gèng duǎn ， hún yù bù shèng zān 。",
    translation: "国都已被攻破，只有山河依旧；长安城里春天来临，草木杂乱丛生。感伤时局，看见花开也落泪；痛恨离别，听到鸟鸣也心惊。战火接连烧了几个月，一封家书抵得上万两黄金。愁得白发越搔越短，简直连簪子都插不住了。",
    notes: [
      { term: "国破", explain: "指756年安史叛军攻陷长安。" },
      { term: "城春草木深", explain: "城中春来，草木疯长，反衬人事凋零、城池荒芜。" },
      { term: "感时花溅泪", explain: "因感伤时局，见花亦落泪；一说花鸟本无情，因人之悲而似溅泪惊心。" },
      { term: "烽火连三月", explain: "战火接连数月。三月，一说指整个春季。" },
      { term: "家书抵万金", explain: "战乱中一封家信极其珍贵。" },
      { term: "浑欲不胜簪", explain: "简直插不住发簪。浑，简直；簪，束发的簪子。" }
    ],
    appreciation: "至德二载，杜甫身陷沦陷的长安，写下这首沉郁顿挫的名作。“国破山河在”起笔即以“破”与“在”的强烈反差，写出江山依旧而国事全非的痛楚。“感时花溅泪，恨别鸟惊心”移情入景，花鸟本乐景，却因家国之痛而化为悲声。“家书抵万金”以极言其贵写乱世离散之苦，道尽天下人心。结句白发稀疏、簪不能束，将忧国、思家、伤老熔于一炉。此诗被誉为“诗史”，是杜甫忧国忧民精神的最高体现。",
    english: "The state is shattered; hills and rivers remain. / Spring floods the city; grass and trees grow deep. / Moved by the times, the flowers scatter tears; / hating separation, the birds alarm my heart. / Beacon fires have burned three months on end; / a letter from home is worth ten thousand in gold. / My white hair, scratched, grows ever thinner — / soon it will not hold a hairpin at all.",
    englishBy: "编者译"
  },

  {
    id: "jingyesi",
    title: "静夜思",
    author: "李白",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 726,
    yearLabel: "盛唐 约 726 年",
    form: "五言绝句（乐府）",
    genre: "诗",
    themes: ["思乡", "月夜"],
    place: { name: "扬州", modern: "今江苏扬州（旧说旅舍作）", lat: 32.39, lng: 119.41 },
    text: "床前明月光，疑是地上霜。\n举头望明月，低头思故乡。",
    pinyin: "chuáng qián míng yuè guāng ， yí shì dì shàng shuāng 。\njǔ tóu wàng míng yuè ， dī tóu sī gù xiāng 。",
    translation: "床前洒下明亮的月光，恍惚间以为是地上落了霜。抬起头望着天上的明月，低下头思念起遥远的故乡。",
    notes: [
      { term: "床", explain: "一说睡床，一说指井栏（“银床”），亦有说为坐具“胡床”，历来聚讼。" },
      { term: "疑是地上霜", explain: "把皎洁的月光误认作地上的白霜，写月色之明、夜之清寒。" },
      { term: "举头 / 低头", explain: "一抬一低之间，思乡之情自然流露，动作极简而情深。" }
    ],
    appreciation: "这是华人世界流传最广、几乎人人能诵的思乡诗。全篇纯用白描，二十字无一僻字，却把游子月夜思乡的情景刻画得淋漓尽致。“疑是地上霜”一句，既写月光之皎，又暗透秋夜之寒与心境之孤。“举头”“低头”两个寻常动作，把由望月到思乡的心理转折写得自然天成。明白如话而意味无穷，正是李白“清水出芙蓉，天然去雕饰”诗风的极致。",
    english: "Before my bed the bright moonlight — / I take it for frost upon the ground. / I lift my head and gaze at the moon, / then bow my head and think of home.",
    englishBy: "编者译"
  },

  {
    id: "youziyin",
    title: "游子吟",
    author: "孟郊",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 800,
    yearLabel: "中唐 约 800 年",
    form: "五言古诗（乐府）",
    genre: "诗",
    themes: ["母爱", "亲情"],
    place: { name: "溧阳", modern: "今江苏溧阳", lat: 31.43, lng: 119.48 },
    text: "慈母手中线，游子身上衣。\n临行密密缝，意恐迟迟归。\n谁言寸草心，报得三春晖。",
    pinyin: "cí mǔ shǒu zhōng xiàn ， yóu zǐ shēn shàng yī 。\nlín xíng mì mì féng ， yì kǒng chí chí guī 。\nshuí yán cùn cǎo xīn ， bào dé sān chūn huī 。",
    translation: "慈爱的母亲手中的针线，为将远行的游子缝制衣衫。临行前一针一线密密地缝，只怕孩子迟迟不能回来。谁说小草那点微弱的心意，能报答得了春天阳光般的母爱呢？",
    notes: [
      { term: "游子", explain: "远行在外的人。此为孟郊在溧阳任上迎养母亲时所作，题下自注“迎母溧上作”。" },
      { term: "临行密密缝", explain: "临行前把衣缝得又密又牢。密密，细密。" },
      { term: "意恐迟迟归", explain: "心里担心孩子迟迟不归。" },
      { term: "寸草心", explain: "小草的心意，喻子女微薄的孝心。" },
      { term: "三春晖", explain: "春天的阳光，喻母亲深广的恩情。三春，孟春、仲春、季春。" }
    ],
    appreciation: "千百年来最动人的母爱之歌。全诗不写母亲之言，只取“临行密密缝”一个细节——那密密的针脚里，缝进的是“意恐迟迟归”的牵挂。末二句“谁言寸草心，报得三春晖”以小草与春晖作比，把子女之孝与母爱之深的悬殊写得深沉恳切，成为孝亲的千古名句。语言质朴无华，情感真挚厚重，正是“苦吟诗人”孟郊难得的温暖之作。",
    english: "The thread in a kind mother's hand — / a coat for the son who will roam. / Closely, closely she sews before he goes, / dreading, dreading the late return. / Who says the heart of an inch-long blade of grass / can repay the warmth of three months' spring sun?",
    englishBy: "编者译"
  },

  {
    id: "jiangxue",
    title: "江雪",
    author: "柳宗元",
    dynasty: "唐",
    dynastyOrder: 6,
    year: 807,
    yearLabel: "中唐 约 807 年（永州贬所）",
    form: "五言绝句",
    genre: "诗",
    themes: ["贬谪", "孤高", "冬景"],
    place: { name: "永州", modern: "今湖南永州", lat: 26.42, lng: 111.61 },
    text: "千山鸟飞绝，万径人踪灭。\n孤舟蓑笠翁，独钓寒江雪。",
    pinyin: "qiān shān niǎo fēi jué ， wàn jìng rén zōng miè 。\ngū zhōu suō lì wēng ， dú diào hán jiāng xuě 。",
    translation: "千山万岭已不见飞鸟的踪影，条条道路都没有了行人的足迹。只有一叶孤舟上，一个披蓑戴笠的老翁，独自在漫天风雪的寒江上垂钓。",
    notes: [
      { term: "绝 / 灭", explain: "绝，绝迹；灭，消失。极写天地间的空寂。" },
      { term: "万径", explain: "无数条道路。" },
      { term: "蓑笠翁", explain: "披蓑衣、戴斗笠的老渔翁。蓑，草或棕制的雨具；笠，竹编的帽。" },
      { term: "独钓寒江雪", explain: "独自在飞雪的寒江上垂钓，寄寓诗人贬谪中孤傲不屈的心境。" }
    ],
    appreciation: "二十字构筑出一幅极致空灵的雪江独钓图。前两句以“千山”“万径”“绝”“灭”极力渲染天地的死寂与苍茫，后两句忽然收束到“孤舟”“独钓”一点，愈显天地之大、人影之孤。柳宗元因参与永贞革新失败被贬永州，这个傲然独钓于风雪寒江的渔翁，正是诗人孤高峻洁、不屈于世的自我写照。四句二十字，每句首字连读为“千万孤独”，境界孤绝，为山水诗中不可复制的绝唱。",
    english: "A thousand hills — no bird in flight; / ten thousand paths — no human trace. / A lone boat, an old man in straw cape and hat, / fishing alone in the cold river snow.",
    englishBy: "编者译"
  },

  {
    id: "shuidiao",
    title: "水调歌头·明月几时有",
    author: "苏轼",
    dynasty: "宋",
    dynastyOrder: 8,
    year: 1076,
    yearLabel: "北宋 1076 年（熙宁九年中秋）",
    form: "词·水调歌头",
    genre: "词",
    themes: ["中秋", "思亲", "哲理", "月夜"],
    place: { name: "密州", modern: "今山东诸城", lat: 35.99, lng: 119.41 },
    text: "明月几时有？把酒问青天。\n不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。",
    pinyin: "míng yuè jǐ shí yǒu ？ bǎ jiǔ wèn qīng tiān 。\nbù zhī tiān shàng gōng què ， jīn xī shì hé nián 。\nwǒ yù chéng fēng guī qù ， yòu kǒng qióng lóu yù yǔ ， gāo chù bù shēng hán 。\nqǐ wǔ nòng qīng yǐng ， hé sì zài rén jiān 。\nzhuǎn zhū gé ， dī qǐ hù ， zhào wú mián 。\nbù yīng yǒu hèn ， hé shì cháng xiàng bié shí yuán ？\nrén yǒu bēi huān lí hé ， yuè yǒu yīn qíng yuán quē ， cǐ shì gǔ nán quán 。\ndàn yuàn rén cháng jiǔ ， qiān lǐ gòng chán juān 。",
    translation: "明月是从什么时候开始有的？我端起酒杯遥问青天。不知道天上的宫殿，今夜是何年何月。我真想乘风回到天上去，又怕那美玉砌成的楼宇太高，经受不住那里的寒冷。在月下起舞，清影随人，哪里比得上在人间呢？月光转过朱红的楼阁，低照进雕花的窗户，照着难以入眠的我。明月不该对人有什么怨恨，为什么总在人们离别时才圆呢？人有悲欢离合，月有阴晴圆缺，这样的事自古就难以两全。只愿彼此都能平安长久，即使相隔千里，也能共赏这一轮明月。",
    notes: [
      { term: "小序", explain: "原词有序：“丙辰中秋，欢饮达旦，大醉，作此篇，兼怀子由。”子由即苏轼之弟苏辙。" },
      { term: "把酒", explain: "端起酒杯。" },
      { term: "宫阙 (gōng què)", explain: "天上的宫殿。" },
      { term: "琼楼玉宇", explain: "美玉砌成的楼阁，指想象中的月宫。" },
      { term: "不胜寒", explain: "受不住寒冷。" },
      { term: "绮户 (qǐ hù)", explain: "雕饰华美的门窗。" },
      { term: "婵娟 (chán juān)", explain: "本指美好的样子，这里指明月。" }
    ],
    appreciation: "此词为中秋词之绝唱，胡仔《苕溪渔隐丛话》云：“中秋词，自东坡《水调歌头》一出，余词尽废。”上片问月、欲归又恐，写出出世与入世之间的徘徊，终以“何似在人间”归于对现世的珍重；下片由月之圆缺推及人之离合，将个人的思弟之情升华为对人生缺憾的普遍体悟。“人有悲欢离合，月有阴晴圆缺，此事古难全”是彻悟而非消沉，“但愿人长久，千里共婵娟”更以旷达的祝愿收束，把离愁化作温暖的共望。全词哲理、情感、想象浑然一体，是苏轼旷达词风的最高代表。",
    english: "When did the bright moon first appear? / Wine cup in hand, I ask the blue sky. / I do not know, in the palaces of heaven, / what year it is tonight. / I long to ride the wind and return there — / yet fear those jade towers, those crystal halls, / too high, too cold to bear. / So I rise and dance with my clear shadow — / how could that heaven match the world of men? / Round the crimson pavilion, / low past the carved window, / it shines on the sleepless one. / It should hold no grudge — / why is it always full when we must part? / Men know sorrow and joy, parting and reunion; / the moon has its dark and bright, its waxing and waning — / such things were never perfect, even long ago. / Only I wish us long life, / that a thousand miles apart we may share her beauty still.",
    englishBy: "编者译"
  },

  {
    id: "rumengling",
    title: "如梦令·常记溪亭日暮",
    author: "李清照",
    dynasty: "宋",
    dynastyOrder: 8,
    year: 1100,
    yearLabel: "北宋 约 1100 年（早年之作）",
    form: "词·如梦令",
    genre: "词",
    themes: ["少女情怀", "田园", "回忆"],
    place: { name: "济南", modern: "今山东济南", lat: 36.65, lng: 117.12 },
    text: "常记溪亭日暮，沉醉不知归路。\n兴尽晚回舟，误入藕花深处。\n争渡，争渡，惊起一滩鸥鹭。",
    pinyin: "cháng jì xī tíng rì mù ， chén zuì bù zhī guī lù 。\nxìng jìn wǎn huí zhōu ， wù rù ǒu huā shēn chù 。\nzhēng dù ， zhēng dù ， jīng qǐ yī tān ōu lù 。",
    translation: "时常记起那次在溪边亭中游玩，直到日暮，因沉醉而忘了回家的路。玩到尽兴，天晚才划船返回，却不小心误入了荷花深处。奋力划呀，奋力划呀，惊得满滩的鸥鹭都扑棱棱飞了起来。",
    notes: [
      { term: "溪亭", explain: "溪边的亭子。" },
      { term: "沉醉", explain: "尽情喝酒，酣醉。既写酒醉，也写陶醉于美景。" },
      { term: "兴尽", explain: "游兴满足。用王徽之雪夜访戴“乘兴而行，兴尽而返”之典。" },
      { term: "藕花", explain: "荷花。" },
      { term: "争渡", explain: "奋力划船。争，怎、抢着；一说通“怎”，怎么渡出去。" },
      { term: "鸥鹭 (ōu lù)", explain: "水鸟，鸥和白鹭。" }
    ],
    appreciation: "这首小令是李清照早年生活的欢快剪影，短短三十三字，宛如一段动感十足的短片。“常记”点明是追忆，“沉醉”“兴尽”写少女游乐的酣畅忘情，“误入藕花深处”一“误”字尽显天真烂漫。结尾“争渡，争渡，惊起一滩鸥鹭”，叠句急促，动作与声响俱出，把一船欢笑、满滩惊飞的鲜活场面定格于纸上。全词纯任天然，毫无雕琢，展现了“千古第一才女”少女时代明媚无忧的心境，与她南渡后的凄清词风恰成对照。",
    english: "Often I recall the riverside pavilion at dusk — / so deep in wine we lost the way home. / Our pleasure spent, we turned the boat back late / and strayed into the heart of the lotus blooms. / Row hard! Row hard! — / and startled a whole shoal of gulls and herons into flight.",
    englishBy: "编者译"
  }
];
