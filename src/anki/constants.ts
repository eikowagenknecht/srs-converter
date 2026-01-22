import type { ColTable, Config, Deck, DeckConfig, NoteType } from "./types";

export const ankiDbSchema = `
CREATE TABLE cards (
  id integer PRIMARY KEY,
  nid integer NOT NULL,
  did integer NOT NULL,
  ord integer NOT NULL,
  mod integer NOT NULL,
  usn integer NOT NULL,
  type integer NOT NULL,
  queue integer NOT NULL,
  due integer NOT NULL,
  ivl integer NOT NULL,
  factor integer NOT NULL,
  reps integer NOT NULL,
  lapses integer NOT NULL,
  left integer NOT NULL,
  odue integer NOT NULL,
  odid integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
);

CREATE TABLE col (
  id integer PRIMARY KEY,
  crt integer NOT NULL,
  mod integer NOT NULL,
  scm integer NOT NULL,
  ver integer NOT NULL,
  dty integer NOT NULL,
  usn integer NOT NULL,
  ls integer NOT NULL,
  conf text NOT NULL,
  models text NOT NULL,
  decks text NOT NULL,
  dconf text NOT NULL,
  tags text NOT NULL
);

CREATE TABLE graves (
  usn integer NOT NULL,
  oid integer NOT NULL,
  type integer NOT NULL
);

CREATE TABLE notes (
  id integer PRIMARY KEY,
  guid text NOT NULL,
  mid integer NOT NULL,
  mod integer NOT NULL,
  usn integer NOT NULL,
  tags text NOT NULL,
  flds text NOT NULL,
  -- The use of type integer for sfld is deliberate, because it means that integer values in this
  -- field will sort numerically.
  sfld integer NOT NULL,
  csum integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
);

CREATE TABLE revlog (
  id integer PRIMARY KEY,
  cid integer NOT NULL,
  usn integer NOT NULL,
  ease integer NOT NULL,
  ivl integer NOT NULL,
  lastIvl integer NOT NULL,
  factor integer NOT NULL,
  time integer NOT NULL,
  type integer NOT NULL
);

CREATE INDEX ix_cards_nid ON cards (nid);

CREATE INDEX ix_cards_sched ON cards (did, queue, due);

CREATE INDEX ix_cards_usn ON cards (usn);

CREATE INDEX ix_notes_csum ON notes (csum);

CREATE INDEX ix_notes_usn ON notes (usn);

CREATE INDEX ix_revlog_cid ON revlog (cid);

CREATE INDEX ix_revlog_usn ON revlog (usn);

PRAGMA page_size = 512;

VACUUM;`;

/**
 * Exported with Anki 25.02.7
 */
export const defaultConfig: Config = {
  activeDecks: [1],
  addToCur: true,
  collapseTime: 1200,
  creationOffset: -120,
  curDeck: 1,
  curModel: 1_731_670_964_298,
  dayLearnFirst: false,
  dueCounts: true,
  estTimes: true,
  newSpread: 0,
  nextPos: 1,
  sched2021: true,
  schedVer: 2,
  sortBackwards: false,
  sortType: "noteFld",
  timeLim: 0,
};

/**
 * Exported with Anki 25.02.7
 */
export const defaultDeck: Deck = {
  browserCollapsed: true,
  collapsed: true,
  conf: 1,
  desc: "",
  dyn: 0,
  extendNew: 0,
  extendRev: 0,
  id: 1,
  lrnToday: [0, 0],
  mod: 0,
  name: "Default",
  newLimit: null,
  newLimitToday: null,
  newToday: [0, 0],
  revToday: [0, 0],
  reviewLimit: null,
  reviewLimitToday: null,
  timeToday: [0, 0],
  usn: 0,
};

/**
 * Exported with Anki 25.02.7
 */
export const defaultDeckConfig: DeckConfig = {
  answerAction: 0,
  autoplay: true,
  buryInterdayLearning: false,
  desiredRetention: 0.9,
  dyn: false,
  fsrsWeights: [],
  id: 1,
  ignoreRevlogsBeforeDate: "",
  interdayLearningMix: 0,
  lapse: {
    delays: [10],
    leechAction: 1,
    leechFails: 8,
    minInt: 1,
    mult: 0,
  },
  maxTaken: 60,
  mod: 0,
  name: "Default",
  new: {
    bury: false,
    delays: [1, 10],
    initialFactor: 2500,
    ints: [1, 4, 0],
    order: 1,
    perDay: 20,
  },
  newGatherPriority: 0,
  newMix: 0,
  newPerDayMinimum: 0,
  newSortOrder: 0,
  questionAction: 0,
  replayq: true,
  rev: {
    bury: false,
    ease4: 1.3,
    hardFactor: 1.2,
    ivlFct: 1,
    maxIvl: 36_500,
    perDay: 200,
  },
  reviewOrder: 0,
  secondsToShowAnswer: 0,
  secondsToShowQuestion: 0,
  sm2Retention: 0.9,
  stopTimerOnAnswer: false,
  timer: 0,
  usn: 0,
  waitForAudio: true,
  weightSearch: "",
};

/**
 * Exported with Anki 25.02.7
 */

export const ankiDefaultCollection: ColTable = {
  conf: defaultConfig,
  crt: 1_681_178_400,
  dconf: {
    "1": defaultDeckConfig,
  },
  decks: {
    "1": defaultDeck,
  },
  dty: 0,
  id: 1,
  ls: 0,
  mod: 1_731_670_964_300,
  models: {},
  scm: 1_731_670_964_297,
  tags: {},
  usn: 0,
  ver: 11,
};

/**
 * Exported with Anki 25.02.7
 *
 * Excludes the `models` column.
 */
export const ankiDefaultCollectionInsert = `INSERT INTO
  "col" ("id","crt","mod","scm","ver","dty","usn","ls","conf","models","decks","dconf","tags")
VALUES
  (
    1,
    1681178400,
    1731670964300,
    1731670964297,
    11,
    0,
    0,
    0,
    '${JSON.stringify(defaultConfig)}',
    '{}',
    '${JSON.stringify({
      "1": defaultDeck,
    })}',
    '${JSON.stringify({
      "1": defaultDeckConfig,
    })}',
    '{}'
  );`;

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicModel: NoteType = {
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  did: null,
  flds: [
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 4_126_305_917_107_322_091n,
      name: "Front",
      ord: 0,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 7_677_420_072_643_128_799n,
      name: "Back",
      ord: 1,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
  ],
  id: 1_731_833_410_648,
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,
  mod: 0,
  name: "Basic (srs-converter)",
  originalStockKind: 1,
  req: [[0, "any", [0]]],
  sortf: 0,
  tmpls: [
    {
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: -3_090_804_417_856_969_834n,
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}",
    },
  ],
  type: 0,
  usn: 0,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicAndReversedCardModel: NoteType = {
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  did: null,
  flds: [
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 7_286_633_949_163_116_757n,
      name: "Front",
      ord: 0,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 211_315_740_831_781_176n,
      name: "Back",
      ord: 1,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
  ],
  id: 1_731_833_410_649,
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,
  mod: 0,
  name: "Basic (and reversed card) (srs-converter)",
  originalStockKind: 1,
  req: [
    [0, "any", [0]],
    [1, "any", [1]],
  ],
  sortf: 0,
  tmpls: [
    {
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: 1_338_176_992_681_603_549n,
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}",
    },
    {
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: 2_048_872_134_865_708_585n,
      name: "Card 2",
      ord: 1,
      qfmt: "{{Back}}",
    },
  ],
  type: 0,
  usn: 0,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicOptionalReversedCardModel: NoteType = {
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  did: null,
  flds: [
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 5_689_307_908_347_332_895n,
      name: "Front",
      ord: 0,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: -5_376_566_526_780_476_496n,
      name: "Back",
      ord: 1,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 8_411_658_332_652_817_393n,
      name: "Add Reverse",
      ord: 2,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
  ],
  id: 1_731_833_410_650,
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,
  mod: 0,
  name: "Basic (optional reversed card) (srs-converter)",
  originalStockKind: 2,
  req: [
    [0, "any", [0]],
    [1, "all", [1, 2]],
  ],
  sortf: 0,
  tmpls: [
    {
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: 3_960_498_485_378_549_049n,
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}",
    },
    {
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: 8_209_064_343_399_031_970n,
      name: "Card 2",
      ord: 1,
      qfmt: "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
    },
  ],
  type: 0,
  usn: 0,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicTypeInTheAnswerModel: NoteType = {
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  did: null,
  flds: [
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 7_138_852_078_461_327_521n,
      name: "Front",
      ord: 0,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 5_032_230_221_549_866_004n,
      name: "Back",
      ord: 1,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: null,
    },
  ],
  id: 1_731_833_410_651,
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,
  mod: 0,
  name: "Basic (type in the answer) (srs-converter)",
  originalStockKind: 3,
  req: [[0, "any", [0, 1]]],
  sortf: 0,
  tmpls: [
    {
      afmt: "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: 865_218_788_646_489_251n,
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}\n\n{{type:Back}}",
    },
  ],
  type: 0,
  usn: 0,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const clozeModel: NoteType = {
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n.cloze {\n    font-weight: bold;\n    color: blue;\n}\n.nightMode .cloze {\n    color: lightblue;\n}\n",
  did: null,
  flds: [
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: -380_300_107_773_965_324n,
      name: "Text",
      ord: 0,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 0,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 924_694_171_596_040_379n,
      name: "Back Extra",
      ord: 1,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 1,
    },
  ],
  id: 1_731_833_410_652,
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,
  mod: 0,
  name: "Cloze (srs-converter)",
  originalStockKind: 5,
  req: [[0, "any", [0]]],
  sortf: 0,
  tmpls: [
    {
      afmt: "{{cloze:Text}}<br>\n{{Back Extra}}",
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: -7_112_645_992_377_779_654n,
      name: "Cloze",
      ord: 0,
      qfmt: "{{cloze:Text}}",
    },
  ],
  type: 1,
  usn: 0,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const imageOcclusionModel: NoteType = {
  css: "#image-occlusion-canvas {\n    --inactive-shape-color: #ffeba2;\n    --active-shape-color: #ff8e8e;\n    --inactive-shape-border: 1px #212121;\n    --active-shape-border: 1px #212121;\n    --highlight-shape-color: #ff8e8e00;\n    --highlight-shape-border: 1px #ff8e8e;\n}\n\n.card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  did: null,
  flds: [
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 4_634_743_404_192_408_464n,
      name: "Occlusion",
      ord: 0,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 0,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: -6_487_991_291_024_703_511n,
      name: "Image",
      ord: 1,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 1,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: -4_022_943_429_031_755_991n,
      name: "Header",
      ord: 2,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 2,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 8_992_957_413_885_085_963n,
      name: "Back Extra",
      ord: 3,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 3,
    },
    {
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 4_741_699_461_831_478_916n,
      name: "Comments",
      ord: 4,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 4,
    },
  ],
  id: 1_751_389_782_741,
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,

  mod: 0,
  name: "Image Occlusion (srs-converter)",
  originalStockKind: 6,
  req: [[0, "any", [0, 1, 2]]],
  sortf: 0,
  tmpls: [
    {
      afmt: '{{#Header}}<div>{{Header}}</div>{{/Header}}\n<div style="display: none">{{cloze:Occlusion}}</div>\n<div id="err"></div>\n<div id="image-occlusion-container">\n    {{Image}}\n    <canvas id="image-occlusion-canvas"></canvas>\n</div>\n<script>\ntry {\n    anki.imageOcclusion.setup();\n} catch (exc) {\n    document.getElementById("err").innerHTML = `Error loading image occlusion. Is your Anki version up to date?<br><br>${exc}`;\n}\n</script>\n\n<div><button id="toggle">Toggle Masks</button></div>\n{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}\n',
      bafmt: "",
      bfont: "",
      bqfmt: "",
      bsize: 0,
      did: null,
      id: -7_179_045_870_360_701_648n,
      name: "Image Occlusion",
      ord: 0,
      qfmt: '{{#Header}}<div>{{Header}}</div>{{/Header}}\n<div style="display: none">{{cloze:Occlusion}}</div>\n<div id="err"></div>\n<div id="image-occlusion-container">\n    {{Image}}\n    <canvas id="image-occlusion-canvas"></canvas>\n</div>\n<script>\ntry {\n    anki.imageOcclusion.setup();\n} catch (exc) {\n    document.getElementById("err").innerHTML = `Error loading image occlusion. Is your Anki version up to date?<br><br>${exc}`;\n}\n</script>\n',
    },
  ],
  type: 1,
  usn: 0,
};
