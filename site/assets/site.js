// Renders the whole page from data/cc4.json, which is regenerated whenever new games are added.
const HIGHLIGHTS = ["unit_kills", "building_kills", "kills", "imperial", "gaia", "longest"];
const HIGHLIGHT_TITLES = { longest: "Longest game" };
const ROWS_SHOWN = 5;

let D, people, teams, gamesById, boardsById;

fetch("data/cc4.json")
  .then((r) => r.json())
  .then((data) => {
    D = data;
    people = D.players.people;
    teams = D.teams;
    gamesById = Object.fromEntries(D.games.map((g) => [g.tag, g]));
    boardsById = Object.fromEntries(D.boards.list.map((b) => [b.id, b]));
    links();
    summary();
    latest();
    highlights();
    groups();
    seriesList();
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
const team = (k) => (teams[k] ? teams[k].name.replace(/^Team /, "") : k);
const player = (id) => (people[id] ? people[id].name : id);

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
  return Math.round(v).toLocaleString("en-US");
}

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
  const kills = D.players.rows.reduce((n, r) => n + r.kills, 0);
  const date = new Date(D.meta.updated + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const cells = [
    [D.meta.games, `games captured · through round ${D.meta.through_round}`],
    [Object.keys(people).length, "players"],
    [kills.toLocaleString("en-US"), "units killed"],
    [date, "last update"],
  ];
  document.getElementById("summary").innerHTML = cells
    .map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`)
    .join("");
}

function latest() {
  const round = Math.max(...D.series.map((s) => s.round));
  const rows = D.series.filter((s) => s.round === round);
  document.getElementById("latest-results").innerHTML =
    `<p class="small" style="margin:0 0 .6rem;color:var(--muted)">Round ${round}</p>` +
    rows
      .map((s) => {
        const [wa, wb] = s.score;
        return `<div class="latest-row">
          <span class="team ${s.winner && s.winner !== s.a ? "lost" : ""}">${esc(team(s.a))}</span>
          <span class="score">${wa}–${wb}</span>
          <span class="team ${s.winner && s.winner !== s.b ? "lost" : ""}">${esc(team(s.b))}</span>
        </div>`;
      })
      .join("");
}

// ---------------------------------------------------------------- highlights

function who(b, r) {
  if (b.scope === "match") return { main: gameLabel(r.g), sub: `Round ${gamesById[r.g].round} · Group ${gamesById[r.g].group}` };
  if (b.scope === "object") return { main: r.o, sub: `${player(r.p)} (${r.civ}) · ${gameLabel(r.g)}` };
  if (b.scope === "player") {
    const bits = [team(people[r.p].team)];
    if (r.d) bits.push(r.d);
    bits.push(`${r.n} game${r.n === 1 ? "" : "s"}`);
    return { main: player(r.p), sub: bits.join(" · ") };
  }
  const bits = [r.civ, gameLabel(r.g)];
  if (r.d) bits.unshift(r.d);
  return { main: player(r.p), sub: bits.join(" · ") };
}

function highlights() {
  document.getElementById("highlights").innerHTML = HIGHLIGHTS.map((id) => boardsById[id])
    .filter((b) => b && b.rows.length)
    .map((b) => {
      const r = b.rows[0], w = who(b, r);
      const unit = b.scope === "object" && b.id.endsWith("kills") ? "kills" : b.unit || (b.id === "gaia" ? "units" : b.id === "kills" ? "kills" : "");
      return `<article class="highlight">
        <span>${esc(HIGHLIGHT_TITLES[b.id] || b.title)}</span>
        <strong>${value(r.v, b.fmt)}${unit ? `<small>${esc(unit)}</small>` : ""}</strong>
        <p><b>${esc(w.main)}</b><br>${esc(w.sub)}</p>
      </article>`;
    })
    .join("");
}

// ---------------------------------------------------------------- groups and results

function groups() {
  const el = document.getElementById("group-tables");
  el.innerHTML = Object.entries(D.groups)
    .map(([g, { table, grid }]) => {
      const rows = table
        .map((r, i) => {
          const d = r.diff > 0 ? `+${r.diff}` : r.diff;
          return `<tr class="${i === D.meta.advance - 1 ? "cut" : ""}">
            <td>${i + 1}</td>
            <td class="team">${esc(team(r.team))}</td>
            <td>${r.played}</td>
            <td>${r.sets_w}–${r.sets_l}</td>
            <td>${r.games_w}–${r.games_l}</td>
            <td class="${r.diff > 0 ? "pos" : r.diff < 0 ? "neg" : ""}">${d}</td>
          </tr>`;
        })
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
            `<span class="${g.winner === t ? "w" : ""}">${esc(team(t))}: ${g.teams[t]
              .map((p) => `<span title="${esc(player(p.p))}"><i class="dot ${esc(p.color)}"></i>${esc(p.civ)}</span>`)
              .join(", ")}</span>`;
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

// ---------------------------------------------------------------- records

function categories() {
  const sw = document.getElementById("category-switch");
  const cats = D.boards.categories.filter((c) => D.boards.list.some((b) => b.cat === c.id));
  sw.innerHTML = cats
    .map((c, i) => `<button role="tab" aria-selected="${i === 0}" data-cat="${c.id}">${esc(c.title)}</button>`)
    .join("");
  sw.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    showCategory(btn.dataset.cat);
  });
  showCategory(cats[0].id);
}

function showCategory(id) {
  const cat = D.boards.categories.find((c) => c.id === id);
  document.getElementById("category-blurb").textContent = cat.blurb;
  const el = document.getElementById("boards");
  el.innerHTML = D.boards.list
    .filter((b) => b.cat === id)
    .map((b) => {
      const items = b.rows
        .map((r, i) => {
          const w = who(b, r);
          // tied values share a rank
          const rank = b.rows.findIndex((x) => x.v === r.v) + 1;
          return `<li class="${i >= ROWS_SHOWN ? "extra" : ""}">
            <span class="rank">${rank}</span>
            <span class="who">${esc(w.main)}<small>${esc(w.sub)}</small></span>
            <span class="val">${value(r.v, b.fmt)}</span>
          </li>`;
        })
        .join("");
      const scope = { game: "One game", player: "All games", object: "One unit or building, one game", match: "Whole game" }[b.scope];
      return `<article class="board" id="board-${b.id}">
        <span class="scope">${scope}</span>
        <h3>${esc(b.title)}</h3>
        ${b.note ? `<p class="note">${esc(b.note)}</p>` : ""}
        <ol>${items}</ol>
        ${b.rows.length > ROWS_SHOWN ? `<button class="more" aria-expanded="false">Show top ${b.rows.length}</button>` : ""}
      </article>`;
    })
    .join("");
  el.querySelectorAll(".more").forEach((btn) =>
    btn.addEventListener("click", () => {
      const card = btn.closest(".board");
      const open = card.classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
      btn.textContent = open ? "Show top 5" : `Show top ${card.querySelectorAll("li").length}`;
    })
  );
}

// ---------------------------------------------------------------- tables

function sortable(tableId, cols, rows, initial, searchId) {
  const table = document.getElementById(tableId);
  let key = initial, dir = -1, query = "";
  table.querySelector("thead").innerHTML =
    "<tr>" + cols.map((c) => `<th data-key="${c.key}" scope="col"><button type="button">${esc(c.label)}</button></th>`).join("") + "</tr>";
  function draw() {
    const shown = rows
      .filter((r) => !query || cols.some((c) => c.search && String(c.text(r)).toLowerCase().includes(query)))
      .sort((a, b) => {
        const x = cols.find((c) => c.key === key).sort(a), y = cols.find((c) => c.key === key).sort(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
      });
    table.querySelectorAll("th").forEach((th) =>
      th.setAttribute("aria-sort", th.dataset.key === key ? (dir > 0 ? "ascending" : "descending") : "none")
    );
    table.querySelector("tbody").innerHTML = shown.length
      ? shown.map((r) => "<tr>" + cols.map((c) => `<td class="${c.cls || "num"}">${esc(c.text(r))}</td>`).join("") + "</tr>").join("")
      : `<tr><td class="loading" colspan="${cols.length}">No player or team matches that search.</td></tr>`;
  }
  table.querySelector("thead").addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const col = cols.find((c) => c.key === th.dataset.key);
    if (key === col.key) dir = -dir;
    else (key = col.key), (dir = col.asc ? 1 : -1);
    draw();
  });
  if (searchId)
    document.getElementById(searchId).addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase();
      draw();
    });
  draw();
}

function playerTable() {
  const cols = [
    { key: "name", label: "Player", cls: "name", text: (r) => player(r.p), sort: (r) => player(r.p).toLowerCase(), asc: true, search: true },
    { key: "team", label: "Team", cls: "team", text: (r) => team(r.team), sort: (r) => team(r.team).toLowerCase(), asc: true, search: true },
    { key: "games", label: "Games", text: (r) => r.games, sort: (r) => r.games },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills },
    { key: "deaths", label: "Deaths", text: (r) => value(r.deaths), sort: (r) => r.deaths },
    { key: "kd", label: "K/D", text: (r) => value(r.kd, "dec2"), sort: (r) => r.kd },
    { key: "eapm", label: "eAPM", text: (r) => value(r.eapm, "dec1"), sort: (r) => r.eapm },
    { key: "feudal", label: "Feudal", text: (r) => time(r.feudal), sort: (r) => r.feudal, asc: true },
    { key: "castle", label: "Castle", text: (r) => time(r.castle), sort: (r) => r.castle, asc: true },
    { key: "imperial", label: "Imperial", text: (r) => time(r.imperial), sort: (r) => r.imperial, asc: true },
    { key: "idle", label: "Idle TC", text: (r) => time(r.idle_castle), sort: (r) => r.idle_castle, asc: true },
    { key: "res", label: "Res / game", text: (r) => value(r.res), sort: (r) => r.res },
  ];
  sortable("player-table", cols, D.players.rows, "kills", "player-search");
}

function civTable() {
  const cols = [
    { key: "civ", label: "Civ", cls: "name", text: (r) => r.civ, sort: (r) => r.civ, asc: true },
    { key: "picks", label: "Picks", text: (r) => r.picks, sort: (r) => r.picks },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "rate", label: "Win %", text: (r) => (r.picks >= 3 ? Math.round((100 * r.wins) / r.picks) + "%" : "–"), sort: (r) => (r.picks >= 3 ? r.wins / r.picks : null) },
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills },
  ];
  sortable("civ-table", cols, D.civs, "picks");
}
