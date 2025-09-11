import type { ColTable, Config, Deck, DeckConfig, NoteType } from "./types.js";

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
  curModel: 1731670964298,
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
  id: 1,
  mod: 0,
  name: "Default",
  usn: 0,
  lrnToday: [0, 0],
  revToday: [0, 0],
  newToday: [0, 0],
  timeToday: [0, 0],
  collapsed: true,
  browserCollapsed: true,
  desc: "",
  dyn: 0,
  conf: 1,
  extendNew: 0,
  extendRev: 0,
  reviewLimit: null,
  newLimit: null,
  reviewLimitToday: null,
  newLimitToday: null,
};

/**
 * Exported with Anki 25.02.7
 */
export const defaultDeckConfig: DeckConfig = {
  id: 1,
  mod: 0,
  name: "Default",
  usn: 0,
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  new: {
    bury: false,
    delays: [1.0, 10.0],
    initialFactor: 2500,
    ints: [1, 4, 0],
    order: 1,
    perDay: 20,
  },
  rev: {
    bury: false,
    ease4: 1.3,
    ivlFct: 1.0,
    maxIvl: 36500,
    perDay: 200,
    hardFactor: 1.2,
  },
  lapse: {
    delays: [10.0],
    leechAction: 1,
    leechFails: 8,
    minInt: 1,
    mult: 0.0,
  },
  dyn: false,
  newMix: 0,
  newPerDayMinimum: 0,
  interdayLearningMix: 0,
  reviewOrder: 0,
  newSortOrder: 0,
  newGatherPriority: 0,
  buryInterdayLearning: false,
  fsrsWeights: [],
  desiredRetention: 0.9,
  ignoreRevlogsBeforeDate: "",
  stopTimerOnAnswer: false,
  secondsToShowQuestion: 0.0,
  secondsToShowAnswer: 0.0,
  questionAction: 0,
  answerAction: 0,
  waitForAudio: true,
  sm2Retention: 0.9,
  weightSearch: "",
};

/**
 * Exported with Anki 25.02.7
 */

export const ankiDefaultCollection: ColTable = {
  id: 1,
  crt: 1681178400,
  mod: 1731670964300,
  scm: 1731670964297,
  ver: 11,
  dty: 0,
  usn: 0,
  ls: 0,
  conf: defaultConfig,
  models: {},
  decks: {
    "1": defaultDeck,
  },
  dconf: {
    "1": defaultDeckConfig,
  },
  tags: {},
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
  id: 1731833410648,
  name: "Basic (srs-converter)",
  type: 0,
  mod: 0,
  usn: 0,
  sortf: 0,
  did: null,
  tmpls: [
    {
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: -3090804417856969834n,
    },
  ],
  flds: [
    {
      name: "Front",
      ord: 0,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 4126305917107322091n,
      tag: null,
      preventDeletion: false,
    },
    {
      name: "Back",
      ord: 1,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 7677420072643128799n,
      tag: null,
      preventDeletion: false,
    },
  ],
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  latexsvg: false,
  req: [[0, "any", [0]]],
  originalStockKind: 1,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicAndReversedCardModel: NoteType = {
  id: 1731833410649,
  name: "Basic (and reversed card) (srs-converter)",
  type: 0,
  mod: 0,
  usn: 0,
  sortf: 0,
  did: null,
  tmpls: [
    {
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: 1338176992681603549n,
    },
    {
      name: "Card 2",
      ord: 1,
      qfmt: "{{Back}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: 2048872134865708585n,
    },
  ],
  flds: [
    {
      name: "Front",
      ord: 0,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 7286633949163116757n,
      tag: null,
      preventDeletion: false,
    },
    {
      name: "Back",
      ord: 1,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 211315740831781176n,
      tag: null,
      preventDeletion: false,
    },
  ],
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  latexsvg: false,
  req: [
    [0, "any", [0]],
    [1, "any", [1]],
  ],
  originalStockKind: 1,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicOptionalReversedCardModel: NoteType = {
  id: 1731833410650,
  name: "Basic (optional reversed card) (srs-converter)",
  type: 0,
  mod: 0,
  usn: 0,
  sortf: 0,
  did: null,
  tmpls: [
    {
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: 3960498485378549049n,
    },
    {
      name: "Card 2",
      ord: 1,
      qfmt: "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
      afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: 8209064343399031970n,
    },
  ],
  flds: [
    {
      name: "Front",
      ord: 0,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 5689307908347332895n,
      tag: null,
      preventDeletion: false,
    },
    {
      name: "Back",
      ord: 1,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: -5376566526780476496n,
      tag: null,
      preventDeletion: false,
    },
    {
      name: "Add Reverse",
      ord: 2,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 8411658332652817393n,
      tag: null,
      preventDeletion: false,
    },
  ],
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  latexsvg: false,
  req: [
    [0, "any", [0]],
    [1, "all", [1, 2]],
  ],
  originalStockKind: 2,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const basicTypeInTheAnswerModel: NoteType = {
  id: 1731833410651,
  name: "Basic (type in the answer) (srs-converter)",
  type: 0,
  mod: 0,
  usn: 0,
  sortf: 0,
  did: null,
  tmpls: [
    {
      name: "Card 1",
      ord: 0,
      qfmt: "{{Front}}\n\n{{type:Back}}",
      afmt: "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: 865218788646489251n,
    },
  ],
  flds: [
    {
      name: "Front",
      ord: 0,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 7138852078461327521n,
      tag: null,
      preventDeletion: false,
    },
    {
      name: "Back",
      ord: 1,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 5032230221549866004n,
      tag: null,
      preventDeletion: false,
    },
  ],
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  latexsvg: false,
  req: [[0, "any", [0, 1]]],
  originalStockKind: 3,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const clozeModel: NoteType = {
  id: 1731833410652,
  name: "Cloze (srs-converter)",
  type: 1,
  mod: 0,
  usn: 0,
  sortf: 0,
  did: null,
  tmpls: [
    {
      name: "Cloze",
      ord: 0,
      qfmt: "{{cloze:Text}}",
      afmt: "{{cloze:Text}}<br>\n{{Back Extra}}",
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: -7112645992377779654n,
    },
  ],
  flds: [
    {
      name: "Text",
      ord: 0,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: -380300107773965324n,
      tag: 0,
      preventDeletion: true,
    },
    {
      name: "Back Extra",
      ord: 1,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
      description: "",
      plainText: false,
      collapsed: false,
      excludeFromSearch: false,
      id: 924694171596040379n,
      tag: 1,
      preventDeletion: false,
    },
  ],
  css: ".card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n.cloze {\n    font-weight: bold;\n    color: blue;\n}\n.nightMode .cloze {\n    color: lightblue;\n}\n",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexPost: "\\end{document}",
  latexsvg: false,
  req: [[0, "any", [0]]],
  originalStockKind: 5,
};

/**
 * Exported with Anki 25.02.7, IDs are randomly generated (by Anki).
 */
export const imageOcclusionModel: NoteType = {
  id: 1751389782741,
  name: "Image Occlusion (srs-converter)",
  type: 1,
  mod: 0,
  usn: 0,
  sortf: 0,
  did: null,

  tmpls: [
    {
      name: "Image Occlusion",
      ord: 0,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a template string for Anki
      qfmt: '{{#Header}}<div>{{Header}}</div>{{/Header}}\n<div style="display: none">{{cloze:Occlusion}}</div>\n<div id="err"></div>\n<div id="image-occlusion-container">\n    {{Image}}\n    <canvas id="image-occlusion-canvas"></canvas>\n</div>\n<script>\ntry {\n    anki.imageOcclusion.setup();\n} catch (exc) {\n    document.getElementById("err").innerHTML = `Error loading image occlusion. Is your Anki version up to date?<br><br>${exc}`;\n}\n</script>\n',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a template string for Anki
      afmt: '{{#Header}}<div>{{Header}}</div>{{/Header}}\n<div style="display: none">{{cloze:Occlusion}}</div>\n<div id="err"></div>\n<div id="image-occlusion-container">\n    {{Image}}\n    <canvas id="image-occlusion-canvas"></canvas>\n</div>\n<script>\ntry {\n    anki.imageOcclusion.setup();\n} catch (exc) {\n    document.getElementById("err").innerHTML = `Error loading image occlusion. Is your Anki version up to date?<br><br>${exc}`;\n}\n</script>\n\n<div><button id="toggle">Toggle Masks</button></div>\n{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}\n',
      bqfmt: "",
      bafmt: "",
      did: null,
      bfont: "",
      bsize: 0,
      id: -7179045870360701648n,
    },
  ],
  flds: [
    {
      name: "Occlusion",
      ord: 0,
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 4634743404192408464n,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 0,
    },
    {
      name: "Image",
      ord: 1,
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: -6487991291024703511n,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 1,
    },
    {
      name: "Header",
      ord: 2,
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: -4022943429031755991n,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 2,
    },
    {
      name: "Back Extra",
      ord: 3,
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 8992957413885085963n,
      plainText: false,
      preventDeletion: true,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 3,
    },
    {
      name: "Comments",
      ord: 4,
      collapsed: false,
      description: "",
      excludeFromSearch: false,
      font: "Arial",
      id: 4741699461831478916n,
      plainText: false,
      preventDeletion: false,
      rtl: false,
      size: 20,
      sticky: false,
      tag: 4,
    },
  ],
  css: "#image-occlusion-canvas {\n    --inactive-shape-color: #ffeba2;\n    --active-shape-color: #ff8e8e;\n    --inactive-shape-border: 1px #212121;\n    --active-shape-border: 1px #212121;\n    --highlight-shape-color: #ff8e8e00;\n    --highlight-shape-border: 1px #ff8e8e;\n}\n\n.card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n",
  latexPost: "\\end{document}",
  latexPre:
    "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
  latexsvg: false,
  req: [[0, "any", [0, 1, 2]]],
  originalStockKind: 6,
};
