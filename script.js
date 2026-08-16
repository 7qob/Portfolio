// Minimal: fill the footer copyright year on every page.
document.addEventListener("DOMContentLoaded", function () {
  var year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  renderContributions();
  initThemeToggle();
  initFigures();
  initBoxScroll();

  // Backend-dependent, and not all in the same way. initVault() and
  // initLogin() return immediately unless their page is the one being shown.
  // initAuth() runs on every page on purpose: the signed-in nav it injects
  // belongs everywhere, which is the one API call a static page does make.
  // All three are no-ops when isOffline(), so a backend-less host stays quiet.
  initAuth();
  initVault();
  initLogin();
});

// Scroll affordances for the locked home page.
//
// On desktop index.html is height-locked and the boxes scroll internally
// (see "One-screen home page" in style.css). CSS can style a scrollbar but it
// cannot ask whether an element actually overflows, so the fade edge — the
// thing that says "there is more text below" — needs a measurement. This is
// that measurement, and nothing more:
//
//   .has-overflow  scrollHeight exceeds clientHeight: fade the bottom edge
//   .is-end        scrolled to the bottom: drop the fade, there is no more
//   tabindex="0"   an overflowing region is keyboard-scrollable
//
// Deliberately measured rather than assumed. The previous version of this
// layout decided at author time which boxes would overflow, hid the
// scrollbars, and was wrong on any screen the author did not own.
//
// Outside the desktop lock the same elements are ordinary blocks with
// overflow visible, so scrollHeight === clientHeight, every class comes back
// off and the tabindex with it. One code path, no viewport sniffing.
function initBoxScroll() {
  var regions = document.querySelectorAll(".is-home .box__body, .is-home .link-box__note");
  if (!regions.length) return;

  function update(el) {
    var overflows = el.scrollHeight - el.clientHeight > 1;
    var atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    el.classList.toggle("has-overflow", overflows);
    el.classList.toggle("is-end", overflows && atEnd);

    if (overflows) el.setAttribute("tabindex", "0");
    else el.removeAttribute("tabindex");
  }

  function updateAll() {
    for (var i = 0; i < regions.length; i++) update(regions[i]);
  }

  for (var i = 0; i < regions.length; i++) {
    (function (el) {
      el.addEventListener("scroll", function () { update(el); }, { passive: true });

      // Catches every reflow that changes the box's height — window resize,
      // zoom, the sidebar of a split-screen window — without polling.
      if (window.ResizeObserver) {
        new ResizeObserver(function () { update(el); }).observe(el);
      }
    })(regions[i]);
  }

  updateAll();
  // Fallback for browsers without ResizeObserver.
  if (!window.ResizeObserver) window.addEventListener("resize", updateAll);
}

// Screenshot slots degrade gracefully. A <figure class="figure"> can be wired
// into a page before its image file exists (e.g. it lands later via upload);
// until then the <img> would render as a broken-image box. This hides any
// figure whose image fails to load, so an empty assets/ never shows a scar.
function initFigures() {
  var imgs = document.querySelectorAll(".figure img");
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    var hide = (function (image) {
      return function () {
        var fig = image.closest(".figure");
        if (fig) fig.hidden = true;
      };
    })(img);
    // Already failed (cached error) or fails later.
    if (img.complete && img.naturalWidth === 0) hide();
    else img.addEventListener("error", hide);
  }
}

// ---------------------------------------------------------------------------
// Backend
//
// index/projects/about/impressum are pure static pages and stay that way —
// they open over file:// and would work on GitHub Pages. Only the vault, the
// login page and the admin panel need the API, and each of them degrades to a
// plain message rather than a broken screen when it is not reachable.
// ---------------------------------------------------------------------------

var API_BASE = "/api";

// Every call carries the CSRF header the server requires on writes, and
// same-origin credentials so the session cookie rides along. GETs do not need
// the header, but sending it everywhere means no call site has to remember
// which ones do.
function api(path, options) {
  var opts = options || {};
  var headers = { "X-Requested-With": "fetch" };

  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.headers) {
    for (var key in opts.headers) headers[key] = opts.headers[key];
  }

  return fetch(API_BASE + path, {
    method: opts.method || "GET",
    credentials: "same-origin",
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
}

// True when there is no backend to talk to. Every backend-dependent feature
// checks this first so a preview does not fill up with failed requests and
// error states.
//
// Two cases, not one. `file:` is the obvious one — opened from disk. GitHub
// Pages is the other, and it was missing: the static half of this site is
// meant to work there with no backend at all, but Pages serves no /api/, so
// initAuth() fired a request on every page that could only ever 404. It is
// checked by hostname rather than by trying and catching, because a request
// that is known to fail should not be sent.
function isOffline() {
  return location.protocol === "file:" ||
         /(^|\.)github\.io$/.test(location.hostname);
}

// Reads the current session once per page. A 401 is the ordinary answer for a
// visitor, not a failure, so nothing is logged for it.
function initAuth() {
  if (isOffline()) return;

  api("/auth/me")
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (data && data.user) showSignedIn(data.user);
    })
    .catch(function () {
      // Backend down. The static pages are unaffected; nothing to say.
    });
}

// Adds the Admin link and a sign-out control for a live session.
//
// Injected rather than written into all twelve pages' markup, so the nav has
// one definition. Worth being explicit that this is presentation only: the
// admin routes are guarded server-side, and adding this link by hand in
// devtools gets a 403, not a panel.
function showSignedIn(user) {
  var nav = document.querySelector(".site-nav");
  if (!nav) return;

  if (user.role === "admin" && !nav.querySelector("[data-admin-link]")) {
    var admin = document.createElement("a");
    admin.href = "/admin.html";
    admin.textContent = "Admin";
    admin.setAttribute("data-admin-link", "");
    if (location.pathname === "/admin.html") admin.setAttribute("aria-current", "page");
    nav.appendChild(admin);
  }

  if (!nav.querySelector("[data-signout]")) {
    var out = document.createElement("a");
    out.href = "#";
    out.className = "site-nav__signout";
    out.textContent = "Sign out";
    out.setAttribute("data-signout", "");
    out.addEventListener("click", function (e) {
      e.preventDefault();
      api("/auth/logout", { method: "POST" })
        .then(function () { location.href = "/index.html"; })
        .catch(function () { location.href = "/index.html"; });
    });
    nav.appendChild(out);
  }
}

// Vault document rows (vault/index.html).
//
// The list arrives from the API, which answers only to an authenticated
// session — the page ships empty, so an unauthenticated visitor never
// receives the document names at all. A row whose file has not been uploaded
// yet renders as unavailable rather than as a download that 404s, which is
// also how a failed upload is told from a successful one.
function initVault() {
  var list = document.getElementById("vault-list");
  var status = document.getElementById("vault-status");
  if (!list) return;

  if (isOffline()) {
    if (status) status.textContent = "The Vault needs the live site — it cannot be opened from a local file.";
    return;
  }

  api("/vault/items")
    .then(function (res) {
      if (res.status === 401) {
        location.replace("/login.html?next=" + encodeURIComponent(location.pathname));
        throw new Error("redirecting");
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var items = (data && data.items) || [];

      if (!items.length) {
        if (status) status.textContent = "No documents are published right now.";
        return;
      }

      items.forEach(function (item) {
        list.appendChild(vaultRow(item));
      });

      list.hidden = false;
      if (status) status.remove();
    })
    .catch(function (err) {
      if (err && err.message === "redirecting") return;
      if (status) status.textContent = "The document list could not be loaded. Please reload.";
    });
}

function vaultRow(item) {
  var li = document.createElement("li");
  li.className = "doc";

  // An <a> with no href is not a link — not focusable, no pointer, no
  // navigation. Cheaper and more correct than aria-disabled on a dead row.
  var row = document.createElement(item.available ? "a" : "span");
  row.className = "doc__link";
  if (item.available) row.href = API_BASE + "/vault/items/" + item.id + "/file";
  else li.classList.add("doc--missing");

  var icon = document.createElement("span");
  icon.className = "doc__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

  // textContent, not innerHTML: these strings come from the database and are
  // editable in the admin panel, so they are treated as text end to end.
  var name = document.createElement("span");
  name.className = "doc__name";
  name.textContent = item.title;

  var meta = document.createElement("span");
  meta.className = "doc__meta";
  if (!item.available) {
    meta.textContent = "Not uploaded";
  } else {
    var size = formatBytes(item.sizeBytes);
    meta.textContent = size ? "PDF · " + size : "PDF";
  }

  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(meta);

  if (item.available) {
    var arrow = document.createElement("span");
    arrow.className = "doc__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    row.appendChild(arrow);
  }

  li.appendChild(row);
  return li;
}

// login.html
function initLogin() {
  var form = document.getElementById("login-form");
  if (!form) return;

  var error = document.getElementById("login-error");
  var submit = document.getElementById("login-submit");
  var next = safeNext(new URLSearchParams(location.search).get("next"));

  if (isOffline()) {
    showLoginError(error, "Signing in needs the live site — it cannot be done from a local file.");
    if (submit) submit.disabled = true;
    return;
  }

  // Already signed in: skip the form rather than make them prove it twice.
  api("/auth/me").then(function (res) {
    if (res.ok) location.replace(next);
  }).catch(function () {});

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var username = form.username.value.trim();
    var password = form.password.value;

    if (!username || !password) {
      showLoginError(error, "Enter both a username and a password.");
      return;
    }

    if (error) error.hidden = true;
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Signing in…";
    }

    api("/auth/login", { method: "POST", body: { username: username, password: password } })
      .then(function (res) {
        if (res.ok) {
          location.replace(next);
          return null;
        }
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(loginMessage(res.status, body));
        });
      })
      .catch(function (err) {
        showLoginError(error, err.message || "Something went wrong. Please try again.");
        form.password.value = "";
        form.password.focus();
      })
      .finally(function () {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Sign in";
        }
      });
  });
}

function loginMessage(status, body) {
  if (status === 429) {
    return (body && body.message) || "Too many attempts. Please wait and try again.";
  }
  if (status === 401) {
    // Matches what the server says, which is deliberately the same sentence
    // for a wrong password, an unknown user and a disabled account.
    return "Invalid username or password.";
  }
  if (status === 400) return "Please check the form and try again.";
  return "Sign-in is unavailable right now. Please try again shortly.";
}

function showLoginError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

// Where to go after signing in.
//
// Only a same-origin absolute path is accepted. Anything else falls back to
// the vault: without this check, /login.html?next=https://evil.example would
// send someone straight off the site after they authenticated, with the site's
// own login page as the referrer. "//evil.example" is the same attack with the
// protocol left off, so a second leading slash (or backslash, which some
// browsers normalise to one) is rejected too.
function safeNext(raw) {
  var fallback = "/vault/";
  if (!raw || raw.charAt(0) !== "/") return fallback;
  if (raw.charAt(1) === "/" || raw.charAt(1) === "\\") return fallback;
  return raw;
}

function formatBytes(value) {
  var bytes = parseInt(value, 10);
  if (!isFinite(bytes) || bytes <= 0) return "";

  var units = ["B", "KB", "MB"];
  var u = 0;
  while (bytes >= 1024 && u < units.length - 1) {
    bytes /= 1024;
    u++;
  }
  // One decimal below 10 (1.4 MB reads better than 1 MB), whole numbers above.
  return (u > 0 && bytes < 10 ? bytes.toFixed(1) : Math.round(bytes)) + " " + units[u];
}

// Dark/Bright theme. Adds/removes .light on <html> (the :root.light palette
// lives in style.css), swaps the Feather moon/sun icon, and remembers the
// choice in localStorage. Default is dark.
//
// The saved choice is applied on EVERY page, whether or not that page has a
// toggle button — otherwise navigating from the bento to a subpage would snap
// a light-mode visitor back to dark. Each page also re-applies it inline in
// <head> so there's no flash before this file runs.
var ICON_MOON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var ICON_SUN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

function initThemeToggle() {
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  // Home page: the icon lives in a .link-box__icon slot. Subpages: a
  // [data-theme-icon] span inside the masthead button.
  var icon = toggle && toggle.querySelector("[data-theme-icon], .link-box__icon");

  function apply(light) {
    root.classList.toggle("light", light);
    if (icon) icon.innerHTML = light ? ICON_SUN : ICON_MOON;
    if (toggle) toggle.setAttribute("aria-pressed", String(light));
  }

  // Restore a saved preference (localStorage may be blocked on file://).
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  apply(saved === "light");

  if (!toggle) return;

  toggle.addEventListener("click", function () {
    var light = !root.classList.contains("light");
    apply(light);
    try { localStorage.setItem("theme", light ? "light" : "dark"); } catch (e) {}
  });
}

// GitHub contribution heatmap.
//
// Data: github-contributions-api.jogruber.de — a third-party mirror of the
// numbers GitHub renders on a profile. No token and no auth, so nothing here
// is secret; the trade is that an outage is someone else's to fix. That is
// what the localStorage cache is for. It degrades in three steps and never to
// a blank hole, which is what the previous version did on any failure:
//
//   fresh data  ->  cached data, silently stale  ->  visible error + retry
//
// A repeat visit also paints from cache before the network answers at all.

var GH_CACHE_KEY = "gh:contributions:v1";
var GH_CACHE_TTL = 6 * 60 * 60 * 1000;   // 6h — the source updates daily at best
var GH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function renderContributions() {
  var root = document.getElementById("gh");
  if (!root) return;

  var user = root.getAttribute("data-gh-user") || "kiraa1q";
  var cached = ghReadCache(user);

  // Paint the cache first so the box is never empty while the network runs.
  if (cached) ghDraw(root, cached.days);
  if (cached && Date.now() - cached.ts < GH_CACHE_TTL) return;

  ghFetch(user)
    .then(function (days) {
      ghWriteCache(user, days);
      ghDraw(root, days);
    })
    .catch(function (err) {
      console.error("GitHub contributions failed to load:", err);
      // Stale squares beat an error message. Only shout if there is nothing.
      if (!cached) ghError(root);
    });
}

function ghFetch(user) {
  var url = "https://github-contributions-api.jogruber.de/v4/" +
            encodeURIComponent(user) + "?y=last";

  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var days = (data && data.contributions) || [];
      if (!days.length) throw new Error("no contribution data");
      return days;
    });
}

function ghReadCache(user) {
  try {
    var v = JSON.parse(localStorage.getItem(GH_CACHE_KEY));
    if (!v || v.user !== user || !v.days || !v.days.length) return null;
    return v;
  } catch (e) {
    return null;   // absent, corrupt, or blocked — all mean "no cache"
  }
}

function ghWriteCache(user, days) {
  try {
    localStorage.setItem(GH_CACHE_KEY, JSON.stringify({
      user: user, ts: Date.now(), days: days
    }));
  } catch (e) {}   // private mode or quota; the graph works without a cache
}

// "2026-03-12" as a LOCAL midnight. Passing the bare string to Date() parses
// it as UTC, which shifts getDay() by one in any negative-offset timezone and
// silently rotates the whole grid by a row.
function ghDate(s) {
  return new Date(s + "T00:00:00");
}

function ghDayText(date, count) {
  var d = ghDate(date);
  var when = d.getDate() + " " + GH_MONTHS[d.getMonth()] + " " + d.getFullYear();
  if (!count) return "No contributions on " + when;
  return count + (count === 1 ? " contribution on " : " contributions on ") + when;
}

function ghStats(days) {
  var total = 0, best = 0, run = 0;

  for (var i = 0; i < days.length; i++) {
    total += days[i].count;
    if (days[i].count > 0) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  // Current streak counts back from the most recent day. A zero on the final
  // day alone does not break it — that day is still in progress.
  var cur = 0;
  var j = days.length - 1;
  if (j >= 0 && days[j].count === 0) j--;
  for (; j >= 0 && days[j].count > 0; j--) cur++;

  return { total: total, current: cur, best: best };
}

function ghDraw(root, days) {
  var chart = root.querySelector("[data-gh-chart]");
  var meta = root.querySelector("[data-gh-meta]");
  if (!chart) return;

  chart.textContent = "";

  // Column-major: one column per week, row 0 = Sunday. Leading blanks push
  // the first day onto its real weekday.
  var slots = [];
  var lead = ghDate(days[0].date).getDay();
  for (var i = 0; i < lead; i++) slots.push(null);
  for (var j = 0; j < days.length; j++) slots.push(days[j]);

  var weeks = Math.ceil(slots.length / 7);
  var stats = ghStats(days);

  var dayCol = document.createElement("div");
  dayCol.className = "gh__days";
  dayCol.setAttribute("aria-hidden", "true");
  ["Mon", "Wed", "Fri"].forEach(function (name, k) {
    var s = document.createElement("span");
    s.style.gridRow = String(2 + k * 2);   // rows 2, 4, 6 of a Sunday-first week
    s.textContent = name;
    dayCol.appendChild(s);
  });

  var scroll = document.createElement("div");
  scroll.className = "gh__scroll";

  var inner = document.createElement("div");
  inner.className = "gh__inner";

  var months = document.createElement("div");
  months.className = "gh__months";
  months.setAttribute("aria-hidden", "true");

  // One label per month, on the week its 1st falls in — skipped when it would
  // collide with the previous one. At the 6px cell size there is only room for
  // roughly eight of the twelve, and overlapping text is worse than a gap.
  var lastMonth = -1, lastWeek = -99;
  for (var w = 0; w < weeks; w++) {
    var first = null;
    for (var r = 0; r < 7 && !first; r++) first = slots[w * 7 + r];
    if (!first) continue;

    var m = ghDate(first.date).getMonth();
    if (m === lastMonth || w - lastWeek < 3) continue;

    var label = document.createElement("span");
    label.className = "gh__month";
    label.style.gridColumn = (w + 1) + " / span 4";
    label.textContent = GH_MONTHS[m];
    months.appendChild(label);
    lastMonth = m;
    lastWeek = w;
  }

  // role="img" with a summary label, rather than a grid of 365 focusable
  // cells. A screen reader wants "how much activity", not a year read out one
  // day at a time — and the real figures are in .gh__meta as plain text
  // below, so nothing here is the only copy of anything.
  var cells = document.createElement("div");
  cells.className = "gh-cells";
  cells.setAttribute("role", "img");
  cells.setAttribute("aria-label",
    stats.total.toLocaleString("en-US") + " contributions in the last year");

  slots.forEach(function (d) {
    var cell = document.createElement("span");
    if (!d) {
      cell.className = "gh-cell gh-cell--pad";
    } else {
      cell.className = "gh-cell";
      cell.setAttribute("data-level", d.level);
      cell.setAttribute("data-date", d.date);
      cell.setAttribute("data-count", d.count);
    }
    cells.appendChild(cell);
  });

  inner.appendChild(months);
  inner.appendChild(cells);
  scroll.appendChild(inner);
  chart.appendChild(dayCol);
  chart.appendChild(scroll);

  ghTooltip(root, cells);

  if (meta) {
    meta.textContent = "";

    // Terse on purpose. This box is one bento cell — roughly 180px of usable
    // width — so "1,234 contributions in the last year · best streak 3 days"
    // wrapped to four lines and crushed the graph. The full sentence lives on
    // the grid's aria-label, where it costs no layout.
    var text = document.createElement("span");
    text.className = "gh__stats";
    text.textContent = stats.total.toLocaleString("en-US") + " contributions";
    if (stats.current > 0) {
      text.textContent += " · " + stats.current + "d streak";
    } else if (stats.best > 0) {
      text.textContent += " · best " + stats.best + "d";
    }

    var legend = document.createElement("span");
    legend.className = "gh__legend";
    legend.setAttribute("aria-hidden", "true");
    legend.appendChild(document.createTextNode("Less"));
    for (var l = 0; l <= 4; l++) {
      var swatch = document.createElement("i");
      swatch.className = "gh-cell";
      swatch.setAttribute("data-level", l);
      legend.appendChild(swatch);
    }
    legend.appendChild(document.createTextNode("More"));

    meta.appendChild(text);
    meta.appendChild(legend);
    meta.hidden = false;
  }

  // Anchor the scroll to the right so recent activity shows first.
  scroll.scrollLeft = scroll.scrollWidth;
}

// Hover readout. Replaces the old title attribute, which never appeared for
// touch users and took a full second to show for anyone else.
function ghTooltip(root, cells) {
  var tip = root.querySelector(".gh__tip");
  if (!tip) {
    tip = document.createElement("span");
    tip.className = "gh__tip";
    root.appendChild(tip);
  }
  tip.hidden = true;

  cells.addEventListener("mouseover", function (e) {
    var cell = e.target.closest(".gh-cell[data-date]");
    if (!cell) return;

    tip.textContent = ghDayText(cell.getAttribute("data-date"),
                                Number(cell.getAttribute("data-count")));
    tip.hidden = false;

    // Positioned against the box, not the scroller, so it is not clipped by
    // the scroller's overflow — and clamped so an edge cell keeps it inside.
    var c = cell.getBoundingClientRect();
    var box = root.getBoundingClientRect();
    var x = c.left - box.left + c.width / 2;

    tip.style.left = Math.max(4, Math.min(x, box.width - 4)) + "px";
    tip.style.top = (c.top - box.top) + "px";
  });

  cells.addEventListener("mouseleave", function () {
    tip.hidden = true;
  });
}

function ghError(root) {
  var chart = root.querySelector("[data-gh-chart]");
  if (!chart) return;

  chart.textContent = "";

  var msg = document.createElement("p");
  msg.className = "gh__status";
  msg.textContent = "Activity unavailable.";

  var retry = document.createElement("button");
  retry.type = "button";
  retry.className = "gh__retry";
  retry.textContent = "Retry";
  retry.addEventListener("click", function () {
    chart.textContent = "";
    var wait = document.createElement("p");
    wait.className = "gh__status";
    wait.textContent = "Loading activity…";
    chart.appendChild(wait);
    renderContributions();
  });

  msg.appendChild(document.createTextNode(" "));
  msg.appendChild(retry);
  chart.appendChild(msg);
}
