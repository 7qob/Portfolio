// Admin panel. Loaded only by admin.html, so the home page never carries it.
//
// Relies on api() and isOffline() from script.js, which is loaded first.
//
// One rule runs through the whole file: every value from the API is written
// with textContent, never innerHTML. Half of what is shown here — user-agent
// strings, usernames from failed logins — is text an attacker chose and the
// server stored verbatim, exactly as it should. This is the page where that
// stops being inert, so it is treated as text end to end.

document.addEventListener("DOMContentLoaded", function () {
  var gate = document.getElementById("admin-gate");
  var body = document.getElementById("admin-body");
  if (!gate || !body) return;

  if (isOffline()) {
    gate.textContent = "The admin panel needs the live site — it cannot be opened from a local file.";
    return;
  }

  api("/auth/me")
    .then(function (res) {
      if (res.status === 401) {
        location.replace("/login.html?next=" + encodeURIComponent(location.pathname));
        throw new Error("redirecting");
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      // A signed-in non-admin gets told plainly rather than shown empty
      // tables that would 403 one by one.
      if (!data.user || data.user.role !== "admin") {
        gate.textContent = "This area is for administrators. You are signed in as " + data.user.username + ".";
        return;
      }

      gate.remove();
      body.hidden = false;
      initTabs();
      loadPanel("overview");
    })
    .catch(function (err) {
      if (err && err.message === "redirecting") return;
      gate.textContent = "Could not reach the server. Please reload.";
    });
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

var loaded = {};

function initTabs() {
  var tabs = [].slice.call(document.querySelectorAll(".admin-tab"));

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      selectTab(tabs, tab);
    });

    // Arrow keys move between tabs, which is what the tablist role promises.
    // Without this the role is a lie to a screen reader.
    tab.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(tab);
      var next = null;

      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];

      if (next) {
        e.preventDefault();
        selectTab(tabs, next);
        next.focus();
      }
    });
  });
}

function selectTab(tabs, active) {
  tabs.forEach(function (tab) {
    var on = tab === active;
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.tabIndex = on ? 0 : -1;

    var panel = document.getElementById("panel-" + tab.getAttribute("data-panel"));
    if (panel) panel.hidden = !on;
  });

  loadPanel(active.getAttribute("data-panel"));
}

// Fetched on first view rather than all at once on load, so opening the panel
// costs one request instead of seven.
function loadPanel(name) {
  if (loaded[name]) return;
  loaded[name] = true;

  var loaders = {
    overview: loadOverview,
    users: loadUsers,
    logins: loadLogins,
    sessions: loadSessions,
    downloads: loadDownloads,
    documents: loadDocuments,
    audit: loadAudit
  };

  if (loaders[name]) loaders[name]();
}

function reload(name) {
  loaded[name] = false;
  loadPanel(name);
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

// Builds a table from plain values. Cells are textContent throughout; a cell
// may also be given a prepared element, which is how the action buttons get in
// without ever concatenating markup.
function renderTable(table, headers, rows, buildRow) {
  table.textContent = "";

  var thead = el("thead");
  var headRow = el("tr");
  headers.forEach(function (h) {
    headRow.appendChild(el("th", null, h));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = el("tbody");

  if (!rows.length) {
    var empty = el("tr");
    var cell = el("td", "admin-empty", "Nothing here yet.");
    cell.colSpan = headers.length;
    empty.appendChild(cell);
    tbody.appendChild(empty);
  } else {
    rows.forEach(function (row) {
      var tr = el("tr");
      buildRow(row).forEach(function (value) {
        if (value instanceof Node) {
          var wrap = el("td");
          wrap.appendChild(value);
          tr.appendChild(wrap);
        } else {
          tr.appendChild(el("td", null, value === null || value === undefined ? "—" : value));
        }
      });
      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
}

function button(label, className, onClick) {
  var b = el("button", "admin-btn " + (className || ""), label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

// SQLite writes UTC without a zone marker; the Z makes the browser read it as
// UTC rather than local, which is a two-hour lie in Bern in summer.
function when(value) {
  if (!value) return "—";
  var d = new Date(String(value).replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

// A full user-agent is 150 characters of noise in a table cell. The whole
// string stays available on hover.
function shortAgent(value) {
  if (!value) return "—";
  var text = String(value);
  var span = el("span", null, text.length > 38 ? text.slice(0, 38) + "…" : text);
  span.title = text;
  return span;
}

function fail(table, error) {
  renderTable(table, ["Error"], [{}], function () {
    return ["Could not load this section. " + (error && error.message ? error.message : "")];
  });
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function loadOverview() {
  var host = document.getElementById("overview-stats");
  var note = document.getElementById("overview-retention");

  api("/admin/overview")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      host.textContent = "";

      [
        ["Accounts", d.users.active + " active", d.users.total + " total, " + d.users.admins + " admin"],
        ["Sessions", d.sessions.active, "signed in right now"],
        ["Logins (24h)", d.logins.succeeded24h + " ok", d.logins.failed24h + " failed, " + d.logins.distinctIps24h + " addresses"],
        ["Downloads", d.downloads.last30Days, "in the last 30 days · " + d.downloads.total + " total"]
      ].forEach(function (stat) {
        var tile = el("div", "admin-stat");
        tile.appendChild(el("span", "admin-stat__label", stat[0]));
        tile.appendChild(el("span", "admin-stat__value", stat[1]));
        tile.appendChild(el("span", "admin-stat__note", stat[2]));
        host.appendChild(tile);
      });

      note.textContent =
        "Login attempts and downloads are deleted automatically after " +
        d.retentionDays + " days. Nothing about anonymous visitors is recorded at all.";
    })
    .catch(function () {
      host.textContent = "";
      host.appendChild(el("p", "admin-note", "Could not load the overview."));
    });
}

function loadUsers() {
  var table = document.getElementById("users-table");
  var form = document.getElementById("create-user-form");
  var out = document.getElementById("new-credentials");

  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      createUser(form, out);
    });
  }

  api("/admin/users")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(
        table,
        ["Username", "Role", "Status", "Issued to", "Last login", ""],
        d.rows,
        function (u) {
          var actions = el("span", "admin-actions");

          actions.appendChild(button(u.disabled_at ? "Enable" : "Disable", "", function () {
            var verb = u.disabled_at ? "enable" : "disable";
            if (!confirm("Really " + verb + " " + u.username + "?")) return;

            api("/admin/users/" + u.id, {
              method: "PATCH",
              body: { disabled: !u.disabled_at }
            }).then(function (res) {
              if (!res.ok) return res.json().then(function (b) { alert(b.message || "Failed."); });
              reload("users");
            });
          }));

          actions.appendChild(button("Reset password", "", function () {
            if (!confirm("Reset the password for " + u.username + "? Their current one stops working immediately.")) return;

            api("/admin/users/" + u.id + "/password", { method: "POST" })
              .then(function (res) { return res.json(); })
              .then(function (b) {
                if (b.password) showSecret(out, b.username, b.password, "Password reset");
                else alert(b.message || "Failed.");
                reload("users");
              });
          }));

          return [
            u.username,
            u.role,
            u.disabled_at ? "disabled" : "active",
            u.note,
            when(u.last_login_at),
            actions
          ];
        }
      );
    })
    .catch(function (e) { fail(table, e); });
}

function createUser(form, out) {
  var body = {
    username: form.username.value.trim(),
    role: form.role.value
  };
  var note = form.note.value.trim();
  if (note) body.note = note;

  if (!body.username) return;

  api("/admin/users", { method: "POST", body: body })
    .then(function (res) {
      return res.json().then(function (b) {
        if (!res.ok) throw new Error(b.message || "Could not create the account.");
        return b;
      });
    })
    .then(function (created) {
      showSecret(out, created.username, created.password, "Account created");
      form.reset();
      reload("users");
    })
    .catch(function (err) {
      alert(err.message);
    });
}

// The one place a password is ever visible. It exists in this response and
// nowhere else — the server stored only its hash — so the copy explains that
// rather than leaving it to be discovered later.
function showSecret(host, username, password, title) {
  if (!host) return;

  host.textContent = "";
  host.appendChild(el("p", "admin-secret__title", title));

  var line = el("p", "admin-secret__value");
  line.appendChild(el("span", null, username + "  /  "));

  var code = el("code", null, password);
  line.appendChild(code);
  host.appendChild(line);

  host.appendChild(button("Copy password", "admin-btn--accent", function () {
    navigator.clipboard.writeText(password).then(function () {
      alert("Copied.");
    }, function () {
      alert("Could not copy — select it by hand.");
    });
  }));

  host.appendChild(el("p", "admin-secret__note",
    "Shown once. Only the hash is stored, so nobody — including you — can read this back later. If it is lost, reset it."));

  host.hidden = false;
}

function loadLogins() {
  var table = document.getElementById("logins-table");

  api("/admin/logins?limit=100")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(table, ["When", "Username", "Result", "Reason", "Address", "Browser"], d.rows, function (a) {
        return [
          when(a.created_at),
          a.username,
          a.success ? "ok" : "failed",
          a.reason,
          a.ip,
          shortAgent(a.user_agent)
        ];
      });
    })
    .catch(function (e) { fail(table, e); });
}

function loadSessions() {
  var table = document.getElementById("sessions-table");

  api("/admin/sessions")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(table, ["User", "Role", "Started", "Last seen", "Address", "Browser", ""], d.rows, function (s) {
        return [
          s.username,
          s.role,
          when(s.created_at),
          when(s.last_seen_at),
          s.ip,
          shortAgent(s.user_agent),
          button("Revoke", "", function () {
            if (!confirm("Sign out " + s.username + " on this session?")) return;
            api("/admin/sessions/" + s.id, { method: "DELETE" }).then(function () {
              reload("sessions");
            });
          })
        ];
      });
    })
    .catch(function (e) { fail(table, e); });
}

function loadDownloads() {
  var table = document.getElementById("downloads-table");

  api("/admin/downloads?limit=100")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(table, ["When", "Who", "Document", "Address", "Browser"], d.rows, function (row) {
        return [
          when(row.created_at),
          row.username,
          row.item_title,
          row.ip,
          shortAgent(row.user_agent)
        ];
      });
    })
    .catch(function (e) { fail(table, e); });
}

function loadDocuments() {
  var table = document.getElementById("documents-table");

  api("/admin/vault-items")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(table, ["Title", "File", "On disk", "Shown", "Order", ""], d.rows, function (item) {
        var titleInput = el("input", "admin-input");
        titleInput.type = "text";
        titleInput.value = item.title;
        titleInput.maxLength = 120;

        var orderInput = el("input", "admin-input admin-input--narrow");
        orderInput.type = "number";
        orderInput.value = item.sortOrder;
        orderInput.min = "0";

        var shown = el("input");
        shown.type = "checkbox";
        shown.checked = item.visible;

        return [
          titleInput,
          item.filename,
          item.available ? "yes" : "missing",
          shown,
          orderInput,
          button("Save", "admin-btn--accent", function () {
            api("/admin/vault-items/" + item.id, {
              method: "PATCH",
              body: {
                title: titleInput.value.trim(),
                visible: shown.checked,
                sortOrder: Number(orderInput.value)
              }
            }).then(function (res) {
              if (!res.ok) return res.json().then(function (b) { alert(b.message || "Failed."); });
              reload("documents");
            });
          })
        ];
      });
    })
    .catch(function (e) { fail(table, e); });
}

function loadAudit() {
  var table = document.getElementById("audit-table");

  api("/admin/audit?limit=100")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(table, ["When", "Who", "Action", "Target", "Detail", "Address"], d.rows, function (a) {
        return [when(a.created_at), a.actor_name, a.action, a.target, a.detail, a.ip];
      });
    })
    .catch(function (e) { fail(table, e); });
}
