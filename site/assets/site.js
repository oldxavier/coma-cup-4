// Renders the whole page from data/cc4.json, which is regenerated whenever new games are added.
const ROWS_SHOWN = 5;
const ROLES = [["all", "All"], ["flank", "Flank"], ["pocket", "Pocket"]];

let D, gamesById, category, role = "all";
const flipped = new Set();          // boards showing their "least" side
const refresh = [];                 // redraws that depend on the role filter

fetch("data/cc4.json")
  .then((r) => r.json())
  .then((data) => {
    D = data;
    gamesById = Object.fromEntries(D.games.map((g) => [g.tag, g]));
    links();
    summary();
    latest();
    groups();
    seriesList();
    roleSwitches();
    categories();
    playerTable();
    civTable();
  })
  .catch((e) => {
    document.querySelectorAll(".loading").forEach((el) => (el.textContent = "The data could not be loaded. Try reloading the page."));
    console.error(e);
  });

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const team = (k) => (D.teams[k] ? D.teams[k].name : k);
const player = (id) => (D.people[id] ? D.people[id].name : id);
// the in-game name, where it differs from the Liquipedia name shown
const alias = (id) => (D.people[id] && D.people[id].ingame !== D.people[id].name ? D.people[id].ingame : "");
const aliasNote = (id) => (alias(id) ? ` (in game: ${esc(alias(id))})` : "");

function emblem(civ) {
  const src = D.emblems[civ];
  return src ? `<img class="emblem" src="${esc(src)}" alt="" width="18" height="18" loading="lazy">` : "";
}
const civTag = (civ) => `<span class="civ">${emblem(civ)}${esc(civ)}</span>`;

function time(s) {
  if (s == null) return "–";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function value(v, fmt) {
  if (v == null) return "–";
  if (fmt === "time") return time(v);
  if (fmt === "dec1") return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (fmt === "dec2") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === "kres") {
    // CaptureAge rounds this above 10,000, so it is shown the way CaptureAge shows it
    if (v < 10000) return Math.round(v).toLocaleString("en-US");
    return (v < 100000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") : Math.round(v / 1000)) + "K";
  }
  return Math.round(v).toLocaleString("en-US");
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

function gameLabel(tag) {
  const g = gamesById[tag];
  return g ? `${team(g.a)} v ${team(g.b)} G${g.n}` : tag;
}

function links() {
  document.querySelectorAll("[data-link]").forEach((a) => {
    const href = D.meta[a.dataset.link];
    if (href) a.href = href;
  });
}

// ---------------------------------------------------------------- header

function summary() {
  const kills = D.players.all.reduce((n, r) => n + r.kills, 0);
  const date = new Date(D.meta.updated + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const cells = [
    [D.meta.games, `games captured · through round ${D.meta.through_round}`],
    [Object.keys(D.people).length, "players"],
    [kills.toLocaleString("en-US"), "units killed"],
    [date, "last update"],
  ];
  document.getElementById("summary").innerHTML = cells
    .map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`)
    .join("");
}

function latest() {
  const round = Math.max(...D.series.map((s) => s.round));
  document.getElementById("latest-results").innerHTML =
    `<p class="latest-round">Round ${round}</p>` +
    D.series
      .filter((s) => s.round === round)
      .map(
        (s) => `<div class="latest-row">
          <span class="team ${s.winner && s.winner !== s.a ? "lost" : ""}">${esc(team(s.a))}</span>
          <span class="score">${s.score[0]}–${s.score[1]}</span>
          <span class="team ${s.winner && s.winner !== s.b ? "lost" : ""}">${esc(team(s.b))}</span>
        </div>`
      )
      .join("");
}

// ---------------------------------------------------------------- groups and results

function groups() {
  document.getElementById("group-tables").innerHTML = Object.entries(D.groups)
    .map(([g, { table, grid }]) => {
      const rows = table
        .map(
          (r, i) => `<tr class="${i === D.meta.advance - 1 ? "cut" : ""}">
            <td>${i + 1}</td>
            <td class="team">${esc(team(r.team))}</td>
            <td>${r.played}</td>
            <td>${r.sets_w}–${r.sets_l}</td>
            <td>${r.games_w}–${r.games_l}</td>
            <td class="${r.diff > 0 ? "pos" : r.diff < 0 ? "neg" : ""}">${r.diff > 0 ? "+" : ""}${r.diff}</td>
          </tr>`
        )
        .join("");
      const order = table.map((r) => r.team);
      const cross = `<div class="crosstab-wrap"><table class="crosstab" aria-label="Group ${g} results by pairing">
        <thead><tr><th></th>${order.map((t) => `<th scope="col">${esc(team(t))}</th>`).join("")}</tr></thead>
        <tbody>${order
          .map(
            (a) => `<tr><th scope="row">${esc(team(a))}</th>${order
              .map((b) => {
                if (a === b) return `<td class="self" aria-label="same team"></td>`;
                const s = grid[`${a}|${b}`];
                if (!s) return `<td class="todo">–</td>`;
                return `<td class="${s[0] > s[1] ? "won" : "lost"}">${s[0]}–${s[1]}</td>`;
              })
              .join("")}</tr>`
          )
          .join("")}</tbody></table></div>`;
      return `<div class="group">
        <h3>Group ${g}</h3>
        <table class="standings">
          <thead><tr><th></th><th>Team</th><th title="Series played">P</th><th title="Series won–lost">Series</th><th title="Games won–lost">Games</th><th title="Game difference">+/–</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="advance-note"><i></i>Top ${D.meta.advance} advance to the playoffs</p>
        ${cross}
      </div>`;
    })
    .join("");
}

function seriesList() {
  const list = [...D.series].sort((x, y) => y.round - x.round || x.group.localeCompare(y.group));
  document.getElementById("series-list").innerHTML = list
    .map((s) => {
      const games = s.games
        .map((tag) => {
          const g = gamesById[tag];
          const side = (t) =>
            `<div class="lineup ${g.winner === t ? "w" : ""}"><b>${esc(team(t))}</b>${g.teams[t]
              .map((p) => `<span title="${esc(player(p.p))}${aliasNote(p.p)}, ${p.role}">${emblem(p.civ)}${esc(p.civ)}</span>`)
              .join("")}</div>`;
          return `<div class="game">
            <b>G${g.n}</b>
            <span class="winner">${esc(team(g.winner))} won${g.parts > 1 ? " · restored once" : ""}</span>
            <span class="len">${time(g.length)}</span>
            <div class="civs">${side(g.a)}${side(g.b)}</div>
          </div>`;
        })
        .join("");
      const [wa, wb] = s.score;
      return `<article class="series">
        <header>
          <b><span class="${s.winner === s.b ? "lost" : ""}">${esc(team(s.a))}</span> ${wa}–${wb} <span class="${s.winner === s.a ? "lost" : ""}">${esc(team(s.b))}</span></b>
          <span>Round ${s.round} · Group ${s.group}</span>
        </header>
        ${games}
      </article>`;
    })
    .join("");
}

// ---------------------------------------------------------------- role filter

function roleSwitches() {
  const els = document.querySelectorAll(".role-switch");
  els.forEach((el) => {
    el.innerHTML = ROLES.map(([k, l]) => `<button type="button" data-role="${k}" aria-pressed="${k === role}">${l}</button>`).join("");
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      role = btn.dataset.role;
      els.forEach((x) => x.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.role === role)));
      refresh.forEach((f) => f());
    });
  });
}

// ---------------------------------------------------------------- records

function categories() {
  const sw = document.getElementById("category-switch");
  const cats = D.boards.categories.filter((c) => D.boards.list.some((b) => b.cat === c.id));
  sw.innerHTML = cats
    .map((c, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-cat="${c.id}">${esc(c.title)}</button>`)
    .join("");
  sw.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    category = btn.dataset.cat;
    showCategory();
  });
  category = cats[0].id;
  refresh.push(showCategory);
  showCategory();
}

function who(b, r) {
  if (b.scope === "match") return { main: gameLabel(r.g), sub: esc(`Round ${gamesById[r.g].round} · Group ${gamesById[r.g].group}`) };
  if (b.scope === "object") return { main: r.o, sub: `${esc(player(r.p))} · ${civTag(r.civ)} · ${esc(gameLabel(r.g))}` };
  if (b.scope === "player") {
    const bits = [esc(team(D.people[r.p].team))];
    if (r.d) bits.push(esc(r.d));
    bits.push(`${r.n} game${r.n === 1 ? "" : "s"}`);
    return { main: player(r.p), sub: bits.join(" · ") };
  }
  const bits = [civTag(r.civ), esc(gameLabel(r.g))];
  if (r.d) bits.unshift(esc(r.d));
  return { main: player(r.p), sub: bits.join(" · ") };
}

const HINTS = { flank: "Mostly a flank stat", pocket: "Mostly a pocket stat" };
const SCOPES = { game: "One game", player: "All games", object: "One unit or building, one game", match: "Whole game" };

function boardCard(b) {
  if (b.scope === "war") return warCard(b);
  const least = flipped.has(b.id) && b.least;
  const side = least ? b.least : b;
  const rows = side.rows[role] || [];
  const items = rows
    .map((r, i) => {
      const w = who(b, r);
      const rank = rows.findIndex((x) => x.v === r.v) + 1;      // ties share a rank
      const result = r.w === undefined ? "" : r.w ? "won" : "lost";
      return `<li class="${i >= ROWS_SHOWN ? "extra" : ""} ${result}">
        <span class="rank">${rank}</span>
        <span class="who"><span class="main" title="${esc(w.main)}${aliasNote(r.p)}">${esc(w.main)}</span><small title="${esc(w.sub.replace(/<[^>]+>/g, ""))}">${w.sub}</small></span>
        <span class="val">${value(r.v, b.fmt)}</span>
      </li>`;
    })
    .join("");
  // shown only once someone has actually skipped it
  const skipped = (b.never || []).filter((r) => role === "all" || r.role === role);
  const never = skipped.length
    ? `<div class="never"><b>${esc(b.never_title)}</b><ul>${skipped
        .map((r) => `<li>${esc(player(r.p))} <small>${civTag(r.civ)} · ${esc(gameLabel(r.g))}</small></li>`)
        .join("")}</ul></div>`
    : "";
  const note = side.note ?? b.note;
  return `<article class="board" id="board-${b.id}" data-id="${b.id}">
    <div class="board-top">
      <span class="scope">${SCOPES[b.scope]}</span>
      ${b.hint ? `<span class="hint">${HINTS[b.hint]}</span>` : ""}
    </div>
    <h3 title="${esc(side.title)}">${esc(side.title)}</h3>
    <div class="flip-slot">${b.least ? `<button type="button" class="flip" aria-pressed="${!!least}">⇅ ${esc(least ? b.title : b.least.title)}</button>` : ""}</div>
    <p class="note" title="${esc(note || "")}">${esc(note || "")}</p>
    ${never}
    ${rows.length ? `<ol>${items}</ol>` : `<p class="empty">No ${role} games yet.</p>`}
    <div class="more-slot">${rows.length > ROWS_SHOWN ? `<button type="button" class="more" aria-expanded="false">Show top ${rows.length}</button>` : ""}</div>
  </article>`;
}

function showCategory() {
  const cat = D.boards.categories.find((c) => c.id === category);
  document.getElementById("category-blurb").innerHTML =
    `${esc(cat.blurb)} <span class="legend"><i class="won"></i>team won that game <i class="lost"></i>lost</span>`;
  const boards = D.boards.list.filter((b) => b.cat === category);
  const main = boards.filter((b) => !b.minor), minor = boards.filter((b) => b.minor);
  const el = document.getElementById("boards");
  el.innerHTML =
    main.map(boardCard).join("") +
    (minor.length
      ? `<details class="minor"><summary>More: ${minor.map((b) => esc(b.title.replace(/^Most /, ""))).join(", ")}</summary><div class="board-grid">${minor
          .map(boardCard)
          .join("")}</div></details>`
      : "");
  el.querySelectorAll(".more").forEach((btn) =>
    btn.addEventListener("click", () => {
      const card = btn.closest(".board");
      const open = card.classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
      btn.textContent = open ? "Show top 5" : `Show top ${card.querySelectorAll("ol > li").length}`;
    })
  );
  el.querySelectorAll(".flip").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest(".board").dataset.id;
      flipped.has(id) ? flipped.delete(id) : flipped.add(id);
      showCategory();
      document.querySelector(`#board-${id} .flip`).focus();
    })
  );
  if (el.querySelector("#war-table")) warTable();
}

// ---------------------------------------------------------------- Dark Age villager war

function warCard(b) {
  return `<article class="board war" id="board-${b.id}">
    <div class="board-top"><span class="scope">One game · per player</span><span class="hint">${HINTS.flank}</span></div>
    <h3>${esc(b.title)}</h3>
    <p class="note">${esc(b.note)}</p>
    <div class="table-shell war-shell"><table class="war-table" id="war-table"><thead></thead><tbody></tbody></table></div>
  </article>`;
}

function warTable() {
  const rows = D.war.filter((r) => role === "all" || r.role === role);
  const cols = [
    { key: "name", label: "Player", cls: "name", html: (r) => `<span title="${esc(player(r.p))}${aliasNote(r.p)}">${esc(player(r.p))}</span><small>${civTag(r.civ)} · ${esc(gameLabel(r.g))}</small>`, sort: (r) => player(r.p).toLowerCase(), asc: true },
    { key: "vs", label: "Against", cls: "team", html: (r) => r.vs.map((p) => esc(player(p))).join(", "), sort: (r) => player(r.vs[0]).toLowerCase(), asc: true },
    { key: "killed", label: "Killed", text: (r) => r.killed, sort: (r) => r.killed },
    { key: "lost", label: "Lost", text: (r) => r.lost, sort: (r) => r.lost },
    { key: "net", label: "Net", text: (r) => signed(r.net), sort: (r) => r.net * 1000 + r.killed + r.lost, tone: (r) => r.net },
    { key: "idle", label: "Idle TC", text: (r) => time(r.idle), sort: (r) => r.idle, asc: true },
    { key: "opp", label: "Their idle TC", text: (r) => time(r.opp_idle), sort: (r) => r.opp_idle },
    { key: "econ", label: "Balance", text: (r) => signed(r.econ), sort: (r) => r.econ, tone: (r) => r.econ, title: `Net villagers plus the idle TC difference at ${D.meta.villager_seconds} s a villager` },
  ];
  sortable("war-table", cols, rows, "net");
}

// ---------------------------------------------------------------- tables

function sortable(tableId, cols, rows, initial, searchId) {
  const table = document.getElementById(tableId);
  let key = initial, dir = -1, query = "";
  table.querySelector("thead").innerHTML =
    "<tr>" + cols.map((c) => `<th data-key="${c.key}" scope="col"${c.title ? ` title="${esc(c.title)}"` : ""}><button type="button">${esc(c.label)}</button></th>`).join("") + "</tr>";
  const cell = (c, r) => {
    const tone = c.tone ? (c.tone(r) > 0 ? " pos" : c.tone(r) < 0 ? " neg" : "") : "";
    return `<td class="${c.cls || "num"}${tone}">${c.html ? c.html(r) : esc(c.text(r))}</td>`;
  };
  function draw() {
    const col = cols.find((c) => c.key === key);
    const shown = rows
      .filter((r) => !query || cols.some((c) => c.search && String(c.text(r)).toLowerCase().includes(query)))
      .sort((a, b) => {
        const x = col.sort(a), y = col.sort(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
      });
    table.querySelectorAll("th").forEach((th) =>
      th.setAttribute("aria-sort", th.dataset.key === key ? (dir > 0 ? "ascending" : "descending") : "none")
    );
    table.querySelector("tbody").innerHTML = shown.length
      ? shown.map((r) => `<tr class="${r.w === undefined ? "" : r.w ? "won" : "lost"}">` + cols.map((c) => cell(c, r)).join("") + "</tr>").join("")
      : `<tr><td class="loading" colspan="${cols.length}">Nothing matches.</td></tr>`;
  }
  table.querySelector("thead").onclick = (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const col = cols.find((c) => c.key === th.dataset.key);
    if (key === col.key) dir = -dir;
    else (key = col.key), (dir = col.asc ? 1 : -1);
    draw();
  };
  if (searchId)
    document.getElementById(searchId).oninput = (e) => {
      query = e.target.value.trim().toLowerCase();
      draw();
    };
  draw();
  return (newRows) => {
    rows = newRows;
    draw();
  };
}

function playerTable() {
  const roleText = (r) => (r.flank && r.pocket ? `${r.flank} flank, ${r.pocket} pocket` : r.flank ? "Flank" : "Pocket");
  const cols = [
    { key: "name", label: "Player", cls: "name", text: (r) => `${player(r.p)} ${alias(r.p)}`, html: (r) => `${esc(player(r.p))}${alias(r.p) ? `<small>in game: ${esc(alias(r.p))}</small>` : ""}`, sort: (r) => player(r.p).toLowerCase(), asc: true, search: true },
    { key: "team", label: "Team", cls: "team", text: (r) => team(r.team), sort: (r) => team(r.team).toLowerCase(), asc: true, search: true },
    { key: "role", label: "Role", cls: "team", text: roleText, sort: (r) => r.flank - r.pocket, search: true },
    { key: "games", label: "Games", text: (r) => r.games, sort: (r) => r.games },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills },
    { key: "deaths", label: "Deaths", text: (r) => value(r.deaths), sort: (r) => r.deaths },
    { key: "kd", label: "K/D", text: (r) => value(r.kd, "dec2"), sort: (r) => r.kd },
    { key: "eapm", label: "eAPM", text: (r) => value(r.eapm, "dec1"), sort: (r) => r.eapm },
    { key: "feudal", label: "Feudal", text: (r) => time(r.feudal), sort: (r) => r.feudal, asc: true },
    { key: "castle", label: "Castle", text: (r) => time(r.castle), sort: (r) => r.castle, asc: true },
    { key: "imperial", label: "Imperial", text: (r) => time(r.imperial), sort: (r) => r.imperial, asc: true },
    { key: "idle_feudal", label: "Idle TC to Feudal", text: (r) => time(r.idle_feudal), sort: (r) => r.idle_feudal, asc: true },
    { key: "idle_castle", label: "Idle TC to Castle", text: (r) => time(r.idle_castle), sort: (r) => r.idle_castle, asc: true },
    { key: "res", label: "Res / game", text: (r) => value(r.res), sort: (r) => r.res },
    { key: "walls", label: "Walls / game", text: (r) => value(r.walls), sort: (r) => r.walls },
  ];
  const update = sortable("player-table", cols, D.players[role], "kills", "player-search");
  refresh.push(() => update(D.players[role]));
}

function civTable() {
  const cols = [
    { key: "civ", label: "Civ", cls: "name", html: (r) => civTag(r.civ), sort: (r) => r.civ, asc: true },
    { key: "picks", label: "Picks", text: (r) => r.picks, sort: (r) => r.picks },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "rate", label: "Win %", text: (r) => (r.picks >= 3 ? Math.round((100 * r.wins) / r.picks) + "%" : "–"), sort: (r) => (r.picks >= 3 ? r.wins / r.picks : null) },
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills },
  ];
  sortable("civ-table", cols, D.civs, "picks");
}
