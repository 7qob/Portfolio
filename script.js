// Minimal: fill the footer copyright year on every page.
document.addEventListener("DOMContentLoaded", function () {
  var year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  renderContributions();
  initThemeToggle();
  initFigures();
  initVault();
});

// Screenshot slots degrade gracefully. A <figure class="figure"> can be wired
// into a page before its image file exists (e.g. it lands later via upload);
// until then the <img> would render as a broken-image box. This hides any
// figure whose image fails to load, so an empty assets/ never shows a scar.
function initFigures() {
  var imgs = document.querySelectorAll(".figure img, .figure-row img");
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

// Vault document rows (vault/index.html).
//
// The documents live only on the Pi, under /var/www/kira1q.dev/vault/files/ —
// never in this repo — so a row can be written before its file has been
// uploaded. One HEAD request per row fills in the real byte count and flags
// anything that isn't there, instead of showing a download that 404s. Same
// principle as initFigures(): the page degrades to an honest state rather
// than a broken one.
//
// Skipped on file://, where fetch() rejects for local files in every browser
// and would therefore mark every row missing while you are just previewing.
// The sizes are a nicety; the links work with or without this running.
function initVault() {
  var links = document.querySelectorAll(".doc__link[href]");
  if (!links.length || location.protocol === "file:") return;

  for (var i = 0; i < links.length; i++) {
    checkDoc(links[i]);
  }
}

function checkDoc(link) {
  var meta = link.querySelector("[data-doc-meta]");

  // same-origin credentials so the browser replays the Basic Auth header it
  // already holds — without it the HEAD would come back 401 and every row
  // would be flagged missing for an authenticated visitor.
  fetch(link.href, { method: "HEAD", credentials: "same-origin" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      var size = formatBytes(res.headers.get("Content-Length"));
      if (meta && size) meta.textContent = meta.textContent.trim() + " · " + size;
    })
    .catch(function () {
      var row = link.closest(".doc");
      if (row) row.classList.add("doc--missing");
      if (meta) meta.textContent = "Not uploaded";
      // An <a> with no href is not a link: not focusable, no pointer, no
      // navigation. Cheaper and more correct than aria-disabled.
      link.removeAttribute("href");
    });
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
// Data from github-contributions-api.jogruber.de (third-party service, no token).
// Fails silently: on error the box is left empty and the page keeps working.
function renderContributions() {
  var box = document.getElementById("gh-graph");
  if (!box) return;

  var username = "kiraa1q";
  var url = "https://github-contributions-api.jogruber.de/v4/" + username + "?y=last";

  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var days = (data && data.contributions) || [];
      if (!days.length) return;

      var firstWeekday = new Date(days[0].date).getDay(); // 0 = Sunday

      var grid = document.createElement("div");
      grid.className = "gh-grid";

      var cells = document.createElement("div");
      cells.className = "gh-cells";

      // Leading transparent cells so the first day lands on its weekday
      // (grid fills column-by-column; row 1 = Sunday).
      for (var i = 0; i < firstWeekday; i++) {
        var pad = document.createElement("span");
        pad.className = "gh-cell gh-cell--pad";
        cells.appendChild(pad);
      }

      days.forEach(function (d) {
        var cell = document.createElement("span");
        cell.className = "gh-cell";
        cell.setAttribute("data-level", d.level);
        cell.title = d.date + ": " + d.count;
        cells.appendChild(cell);
      });

      grid.appendChild(cells);
      box.appendChild(grid);

      // Anchor the graph's own scroll to the right so recent activity shows first.
      box.scrollLeft = box.scrollWidth;
    })
    .catch(function (err) {
      console.error("GitHub contributions failed to load:", err);
    });
}
