// server.js —— 小游戏统一排行榜服务器（纯 Node http，无依赖）
// 支持你网站上所有小游戏：游戏结束上报分数 → 按游戏维护全球榜单 → /ranking 查看
// 自带防刷分：限流(同玩家短时间只允许一次) + 分数上限 + 名字清洗
//
// 启动：node server.js （默认端口 3000，可用 PORT 改）

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "scores.json");

// ===== 游戏配置：best=min 表示“越小越好”(如猜数字次数)，best=max 表示“越大越好”
// cap = 分数上限(超过判为异常，防作弊)
const GAMES = {
  "2048":    { label: "2048",    best: "max", cap: 10000000, unit: "分" },
  "snake":   { label: "贪吃蛇",  best: "max", cap: 10000000, unit: "分" },
  "typing":  { label: "打字",    best: "max", cap: 500,      unit: "字/分" },
  "guess":   { label: "猜数字",  best: "min", cap: 99,       unit: "次" },
  "gomoku":  { label: "五子棋",  best: "max", cap: 100000,   unit: "连胜" },
  "chess":   { label: "象棋",    best: "max", cap: 100000,   unit: "连胜" },
  "fish":    { label: "捕鱼",    best: "max", cap: 10000000, unit: "分" },
  "go":      { label: "围棋",    best: "max", cap: 1000000,  unit: "目" }
};

// 数据：{ "游戏": { "玩家": { score: 最佳分, ts: 时间戳 } } }
let scores = loadScores();

function loadScores() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  } catch (e) {}
  return {};
}

function saveScores() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2));
}

// ===== 防刷分：同玩家两次提交间隔（毫秒） =====
const MIN_INTERVAL = 2000;
const lastSubmit = {};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function sendJSON(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(obj));
}

function sanitizeName(n) {
  return String(n == null ? "" : n)
    .replace(/[<>&"'\\]/g, "")
    .trim()
    .slice(0, 24);
}

// ===== 处理一次成绩提交 =====
function handleSubmit(data) {
  const name = sanitizeName(data.name);
  const game = String(data.game || "").trim();
  const score = Number(data.score);

  if (!name) return { ok: false, message: "名字不能为空" };
  if (!GAMES[game]) return { ok: false, message: "未知游戏：" + game };
  if (isNaN(score) || score < 0) return { ok: false, message: "分数无效" };
  if (score > GAMES[game].cap) return { ok: false, message: "分数异常" };

  // 限流
  const now = Date.now();
  if (lastSubmit[name] && now - lastSubmit[name] < MIN_INTERVAL) {
    return { ok: false, message: "操作太快，稍后再试" };
  }
  lastSubmit[name] = now;

  if (!scores[game]) scores[game] = {};
  const prev = scores[game][name];
  let best;
  if (GAMES[game].best === "min") {
    best = prev && prev.score < score ? prev.score : score;
  } else {
    best = prev && prev.score > score ? prev.score : score;
  }
  scores[game][name] = { score: best, ts: now };
  saveScores();

  return { ok: true, game: game, best: best, unit: GAMES[game].unit };
}

// ===== 取某个游戏的排行榜 =====
function leaderboard(game, limit) {
  const entries = scores[game] || {};
  const arr = Object.keys(entries).map((name) => ({
    name: name,
    score: entries[name].score,
    ts: entries[name].ts
  }));
  const dir = GAMES[game].best === "min" ? 1 : -1; // min:小在前; max:大在前
  arr.sort((a, b) => (dir * (a.score - b.score)) || (a.ts - b.ts)); // 同分先到者先
  return arr.slice(0, limit);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname;
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const pathname = u.pathname;
  const query = u.searchParams;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return;
  }

  // 首页 / 状态
  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("毛毛的小游戏排行榜服务器😋\n游戏：" + Object.keys(GAMES).join("、"));
    return;
  }

  // 列出所有游戏
  if (pathname === "/games") {
    const list = Object.keys(GAMES).map((id) => ({
      id: id,
      label: GAMES[id].label,
      best: GAMES[id].best,
      unit: GAMES[id].unit
    }));
    sendJSON(res, 200, { games: list });
    return;
  }

  // 排行榜：/ranking?game=2048&limit=10 ；不指定则返回所有游戏
  if (pathname === "/ranking") {
    const game = (query.get("game") || "").trim();
    const limit = Math.min(Number(query.get("limit")) || 10, 100);
    if (game) {
      if (!GAMES[game]) return sendJSON(res, 400, { ok: false, message: "未知游戏：" + game });
      return sendJSON(res, 200, { game: game, label: GAMES[game].label, unit: GAMES[game].unit, list: leaderboard(game, limit) });
    }
    const all = {};
    Object.keys(GAMES).forEach((g) => { all[g] = leaderboard(g, limit); });
    return sendJSON(res, 200, { all: all });
  }

  // 提交成绩：/score 或 /win
  if ((pathname === "/score" || pathname === "/win") && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        return sendJSON(res, 400, { ok: false, message: "格式错误" });
      }
      const r = handleSubmit(data);
      sendJSON(res, r.ok ? 200 : 400, r);
    });
    return;
  }

  // 静态文件（ranking.html、test.html 等）
  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log("🎮 小游戏排行榜服务器已启动：http://localhost:" + PORT);
  console.log("  榜单页: http://localhost:" + PORT + "/ranking.html");
  console.log("  提交成绩: POST /score  { name, game, score }");
  console.log("  排行榜: GET /ranking?game=<游戏>&limit=10");
  console.log("  游戏列表: GET /games");
});
