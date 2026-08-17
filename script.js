/* Shared behaviour, loaded by every page. Every init below is a no-op when the
   page has none of its elements, so one file serves all of them. ES5 on
   purpose: no build step, and it has to run straight off disk over file://. */
document.addEventListener("DOMContentLoaded", function () {
  var year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  renderContributions();
  initThemeToggle();
  initFigures();
  initClipToggles();
  initBoxScroll();

  initAuth();
  initVault();
  initLogin();
});

/* Overflow is measured, never assumed: .has-overflow drives the fade mask and
   an overflowing region gets tabindex so it can be scrolled by keyboard. */
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

      if (window.ResizeObserver) {
        new ResizeObserver(function () { update(el); }).observe(el);
      }
    })(regions[i]);
  }

  updateAll();
  if (!window.ResizeObserver) window.addEventListener("resize", updateAll);
}

function initFigures() {
  var imgs = document.querySelectorAll(".figure img, .mediarow img, .mediarow video");
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    var hide = (function (image) {
      return function () {
        var fig = image.closest(".figure, .mediarow");
        if (fig) fig.hidden = true;

        var band = image.closest(".reveal");
        if (band && !band.querySelector(".mediarow:not([hidden])")) {
          band.hidden = true;
        }
      };
    })(img);
    if (img.complete && img.naturalWidth === 0) hide();
    else img.addEventListener("error", hide);
  }
}

function initClipToggles() {
  var frames = document.querySelectorAll(".mediarow__frame");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (var i = 0; i < frames.length; i++) {
    (function (frame) {
      var video = frame.querySelector("video");
      if (!video) return;

      var toggle = frame.querySelector("[data-clip-toggle]");
      var full = frame.querySelector("[data-clip-fullscreen]");
      var fill = frame.querySelector("[data-clip-fill]");

      if (toggle) {
        var pause = toggle.querySelector('[data-clip-icon="pause"]');
        var play = toggle.querySelector('[data-clip-icon="play"]');

        var syncPlay = function () {
          pause.hidden = video.paused;
          play.hidden = !video.paused;
          toggle.setAttribute("aria-label", video.paused ? "Play clip" : "Pause clip");
        };

        toggle.addEventListener("click", function () {
          if (video.paused) video.play();
          else video.pause();
        });

        video.addEventListener("play", syncPlay);
        video.addEventListener("pause", syncPlay);

        if (still) {
          video.autoplay = false;
          video.pause();
        }
        syncPlay();
      }

      if (full) {
        var enter = full.querySelector('[data-clip-icon="enter"]');
        var exit = full.querySelector('[data-clip-icon="exit"]');

        var syncFull = function () {
          var on = document.fullscreenElement === frame;
          enter.hidden = on;
          exit.hidden = !on;
          full.setAttribute("aria-label", on ? "Exit fullscreen" : "Fullscreen");
        };

        full.addEventListener("click", function () {
          if (document.fullscreenElement === frame) document.exitFullscreen();
          else if (frame.requestFullscreen) frame.requestFullscreen();
        });

        document.addEventListener("fullscreenchange", syncFull);
        syncFull();
      }

      if (fill) {
        video.addEventListener("timeupdate", function () {
          var d = video.duration;
          fill.style.width = d ? (video.currentTime / d) * 100 + "%" : 0;
        });
      }
    })(frames[i]);
  }
}

var API_BASE = "/api";

function api(path, options) {
  var opts = options || {};
  var headers = { "X-Requested-With": "fetch" };

  var isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;

  if (opts.body && !isForm) headers["Content-Type"] = "application/json";
  if (opts.headers) {
    for (var key in opts.headers) headers[key] = opts.headers[key];
  }

  return fetch(API_BASE + path, {
    method: opts.method || "GET",
    credentials: "same-origin",
    headers: headers,
    body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined
  });
}

/* No API here: over file:// or on GitHub Pages the backend does not exist, and
   a failed call would replace a working static page with an error. */
function isOffline() {
  return location.protocol === "file:" ||
         /(^|\.)github\.io$/.test(location.hostname);
}

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
    });
}

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

  var header = nav.parentNode;
  if (header && !header.querySelector("[data-signout]")) {
    var out = document.createElement("button");
    out.type = "button";
    out.className = "icon-btn site-header__signout";
    out.title = "Sign out";
    out.setAttribute("aria-label", "Sign out");
    out.setAttribute("data-signout", "");
    out.innerHTML = ICON_DOOR;
    out.addEventListener("click", function () {
      api("/auth/logout", { method: "POST" })
        .then(function () { location.href = "/index.html"; })
        .catch(function () { location.href = "/index.html"; });
    });
    var toggle = document.getElementById("theme-toggle");
    if (toggle && toggle.parentNode === header) header.insertBefore(out, toggle);
    else header.appendChild(out);
    header.classList.add("has-signout");
  }
}

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

  var row = document.createElement(item.available ? "a" : "span");
  row.className = "doc__link";
  if (item.available) row.href = API_BASE + "/vault/items/" + item.id + "/file";
  else li.classList.add("doc--missing");

  var icon = document.createElement("span");
  icon.className = "doc__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

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
  return (u > 0 && bytes < 10 ? bytes.toFixed(1) : Math.round(bytes)) + " " + units[u];
}

var ICON_MOON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var ICON_SUN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
var ICON_DOOR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

function initThemeToggle() {
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  var icon = toggle && toggle.querySelector("[data-theme-icon], .link-box__icon");

  function apply(light) {
    root.classList.toggle("light", light);
    if (icon) icon.innerHTML = light ? ICON_SUN : ICON_MOON;
    if (toggle) toggle.setAttribute("aria-pressed", String(light));
  }

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

var GH_CACHE_KEY = "gh:contributions:v1";
var GH_CACHE_TTL = 6 * 60 * 60 * 1000;   // 6h — the source updates daily at best
var GH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var GH_ROWS = 7;                         // days in a column

function renderContributions() {
  var root = document.getElementById("gh");
  if (!root) return;

  var user = root.getAttribute("data-gh-user") || "kiraa1q";
  var cached = ghReadCache(user);

  if (cached) ghDraw(root, cached.days);
  if (cached && Date.now() - cached.ts < GH_CACHE_TTL) return;

  ghFetch(user)
    .then(function (days) {
      ghWriteCache(user, days);
      ghDraw(root, days);
    })
    .catch(function (err) {
      console.error("GitHub contributions failed to load:", err);
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

function ghDate(s) {
  return new Date(s + "T00:00:00");
}

function ghWhen(date) {
  var d = ghDate(date);
  return d.getDate() + " " + GH_MONTHS[d.getMonth()] + " " + d.getFullYear();
}

function ghDayText(date, count) {
  var when = ghWhen(date);
  if (!count) return "No contributions on " + when;
  return count + (count === 1 ? " contribution on " : " contributions on ") + when;
}

/* Days padded front and back to whole Sunday-first weeks, so a slice at any
   multiple of 7 is still a week boundary. */
function ghSlots(days) {
  var slots = [];
  var lead = ghDate(days[0].date).getDay();

  for (var i = 0; i < lead; i++) slots.push(null);
  for (var j = 0; j < days.length; j++) slots.push(days[j]);
  while (slots.length % GH_ROWS) slots.push(null);

  return slots;
}

/* How many weeks the card can hold, measured rather than assumed: square cells
   that fill the height decide it. Fewer than the year — the oldest weeks are
   dropped rather than squeezed into slivers. More room than weeks — the count
   stands and the 1fr columns stretch, which is what keeps the grid flush. */
function ghWeeks(chart, total) {
  var box = chart.getBoundingClientRect();
  if (!box.width || !box.height) return total;

  var gap = parseFloat(getComputedStyle(chart).getPropertyValue("--gh-gap")) || 0;
  var cell = (box.height - (GH_ROWS - 1) * gap) / GH_ROWS;
  if (cell <= 0) return total;

  return Math.max(1, Math.min(total, Math.floor((box.width + gap) / (cell + gap))));
}

function ghLabel(slots) {
  var total = 0, first = null, last = null;

  for (var i = 0; i < slots.length; i++) {
    if (!slots[i]) continue;
    total += slots[i].count;
    if (!first) first = slots[i].date;
    last = slots[i].date;
  }

  return total.toLocaleString("en-US") + " contributions, " +
         ghWhen(first) + " to " + ghWhen(last);
}

/* The graph is the whole widget: no month ruler, no weekday column, no legend,
   so the cells get the entire box. What day a cell is comes from its tooltip. */
function ghDraw(root, days) {
  var chart = root.querySelector("[data-gh-chart]");
  if (!chart) return;

  var slots = ghSlots(days);
  var weeks = ghWeeks(chart, slots.length / GH_ROWS);
  if (weeks < slots.length / GH_ROWS) {
    slots = slots.slice(slots.length - weeks * GH_ROWS);
  }

  var cells = document.createElement("div");
  cells.className = "gh-cells";
  cells.style.setProperty("--gh-weeks", String(weeks));
  cells.setAttribute("role", "img");
  cells.setAttribute("aria-label", ghLabel(slots));

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

  chart.textContent = "";
  chart.appendChild(cells);

  ghTooltip(root, cells);
  ghWatch(root, days);
}

/* The week count is a function of the card's size, so it is recomputed when the
   card resizes — once per element, and only when the count actually moves. */
function ghWatch(root, days) {
  root.ghDays = days;
  if (root.ghObserver || !window.ResizeObserver) return;

  var chart = root.querySelector("[data-gh-chart]");
  if (!chart) return;

  root.ghObserver = new ResizeObserver(function () {
    var cells = chart.querySelector(".gh-cells");
    if (!cells) return;

    var total = ghSlots(root.ghDays).length / GH_ROWS;
    if (ghWeeks(chart, total) !== Number(cells.style.getPropertyValue("--gh-weeks"))) {
      ghDraw(root, root.ghDays);
    }
  });
  root.ghObserver.observe(chart);
}

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
