// Minimal: fill the footer copyright year on every page.
document.addEventListener("DOMContentLoaded", function () {
  var year = document.getElementById("year");
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  renderContributions();
  initThemeToggle();
});

// Dark/Bright theme toggle. Adds/removes .light on <html> (the :root.light
// palette lives in style.css), swaps the Feather moon/sun icon, and remembers
// the choice in localStorage. Default is dark.
var ICON_MOON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var ICON_SUN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

function initThemeToggle() {
  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  var root = document.documentElement;
  var icon = toggle.querySelector(".link-box__icon");

  function apply(light) {
    root.classList.toggle("light", light);
    if (icon) icon.innerHTML = light ? ICON_SUN : ICON_MOON;
    toggle.setAttribute("aria-pressed", String(light));
  }

  // Restore a saved preference (localStorage may be blocked on file://).
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  apply(saved === "light");

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
