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
    projects: loadProjects,
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

// ---------------------------------------------------------------------------
// Pages — the project-page CMS.
//
// A project is head fields plus a linear stack of typed blocks. The stack is
// a form that grows: each block is a bordered card with its own fields and
// up/down/remove controls, and an "Add block" select at the bottom. Publish
// asks the server to render the whole thing to a static file; nothing here
// touches the generated page directly.
//
// The textContent rule holds with extra force in this panel: everything typed
// here round-trips through the API and comes back to be edited again, and on
// Publish it becomes a PUBLIC page. This form never interprets any of it as
// markup — and the server escapes it all over again before it renders.
// ---------------------------------------------------------------------------

// Must match the icon catalogue in the server's renderer.
var CHIP_ICONS = ["nodes", "image", "python", "rust", "proxy", "stream",
                  "cloud", "react", "typescript", "kobold", "node"];

var BLOCK_TYPES = [
  ["section",  "Text section"],
  ["steps",    "Numbered steps"],
  ["features", "Feature list"],
  ["table",    "Table"],
  ["figure",   "Screenshot"],
  ["media",    "Clips band (GIFs / MP4)"],
  ["datarow",  "Facts strip"],
  ["files",    "Downloads"],
  ["links",    "Links"]
];

var PALETTES = ["comfy", "ignite", "kobui", "stalkr"];

function loadProjects() {
  var form = document.getElementById("create-project-form");

  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = { slug: form.slug.value.trim(), title: form.title.value.trim() };
      if (!body.slug || !body.title) return;

      api("/admin/projects", { method: "POST", body: body })
        .then(function (res) {
          return res.json().then(function (b) {
            if (!res.ok) throw new Error(b.message || "Could not create the page.");
            return b;
          });
        })
        .then(function (created) {
          form.reset();
          openProjectEditor(created.id);
        })
        .catch(function (err) { alert(err.message); });
    });
  }

  loadProjectsTable();
  loadMediaTable();
}

function loadProjectsTable() {
  var table = document.getElementById("projects-table");

  api("/admin/projects")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(
        table,
        ["Title", "Slug", "Status", "Order", "Published", ""],
        d.rows,
        function (p) {
          var actions = el("span", "admin-actions");

          actions.appendChild(button("Edit", "admin-btn--accent", function () {
            openProjectEditor(p.id);
          }));

          if (p.publishedAt) {
            actions.appendChild(button("Unpublish", "", function () {
              if (!confirm("Take project-" + p.slug + ".html off the site?")) return;
              api("/admin/projects/" + p.id + "/unpublish", { method: "POST" })
                .then(function (res) {
                  if (!res.ok) return res.json().then(function (b) { alert(b.message || "Failed."); });
                  reload("projects");
                });
            }));
          }

          actions.appendChild(button("Delete", "", function () {
            var warning = p.publishedAt
              ? "Delete " + p.title + "? Its page comes off the site immediately."
              : "Delete the draft " + p.title + "?";
            if (!confirm(warning)) return;
            api("/admin/projects/" + p.id, { method: "DELETE" })
              .then(function (res) {
                if (!res.ok) return res.json().then(function (b) { alert(b.message || "Failed."); });
                reload("projects");
              });
          }));

          var published = p.publishedAt ? when(p.publishedAt) : "draft";
          if (p.publishedAt && p.updatedAt > p.publishedAt) published += " · edits pending";

          return [p.title, p.slug, p.status, p.sortOrder, published, actions];
        }
      );
    })
    .catch(function (e) { fail(table, e); });
}

function loadMediaTable() {
  var table = document.getElementById("media-table");

  api("/admin/media")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      renderTable(
        table,
        ["File", "Uploaded as", "Type", "Size", "Dimensions", ""],
        d.rows,
        function (m) {
          return [
            m.filename,
            m.original_name,
            m.mime,
            formatBytes(m.size_bytes),
            m.width && m.height ? m.width + " × " + m.height : "—",
            button("Delete", "", function () {
              if (!confirm("Delete " + m.filename + "? Pages that still use it will refuse this.")) return;
              api("/admin/media/" + m.id, { method: "DELETE" })
                .then(function (res) {
                  if (res.ok) return loadMediaTable();
                  return res.json().then(function (b) { alert(b.message || "Failed."); });
                });
            })
          ];
        }
      );
    })
    .catch(function (e) { fail(table, e); });
}

// ---------------------------------------------------------------------------
// Uploads. Dimensions are measured in the browser before the file leaves it —
// exact numbers, no server-side image library — and ride along as form fields.
// ---------------------------------------------------------------------------

function measureFile(file) {
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(file);
    var done = function (w, h) {
      URL.revokeObjectURL(url);
      resolve({ width: w || null, height: h || null });
    };

    if (file.type.indexOf("image/") === 0) {
      var img = new Image();
      img.onload = function () { done(img.naturalWidth, img.naturalHeight); };
      img.onerror = function () { done(null, null); };
      img.src = url;
    } else if (file.type === "video/mp4") {
      var video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = function () { done(video.videoWidth, video.videoHeight); };
      video.onerror = function () { done(null, null); };
      video.src = url;
    } else {
      done(null, null);
    }
  });
}

function uploadMedia(file) {
  return measureFile(file).then(function (dims) {
    var fd = new FormData();
    fd.append("file", file);
    if (dims.width) fd.append("width", dims.width);
    if (dims.height) fd.append("height", dims.height);

    return api("/admin/media", { method: "POST", body: fd });
  }).then(function (res) {
    return res.json().then(function (b) {
      if (!res.ok) throw new Error(b.message || "Upload failed.");
      return b;
    });
  });
}

function mediaLabel(m) {
  var name = m.original_name || m.filename;
  return name + " · " + m.mime + (m.size_bytes ? " · " + formatBytes(m.size_bytes) : "");
}

// A select of existing uploads plus a file input that uploads immediately and
// selects the result. `mediaRows` is the editor's shared list, so an upload
// made in one block is offered in every other one opened afterwards.
function mediaPicker(mediaRows, currentId, accept) {
  var select = el("select", "auth-field__input");
  select.appendChild(new Option("— choose an upload —", ""));
  mediaRows.forEach(function (m) {
    select.appendChild(new Option(mediaLabel(m), String(m.id)));
  });
  if (currentId) select.value = String(currentId);

  var file = el("input", "admin-input");
  file.type = "file";
  if (accept) file.accept = accept;

  file.addEventListener("change", function () {
    if (!file.files.length) return;
    file.disabled = true;

    uploadMedia(file.files[0])
      .then(function (row) {
        var known = mediaRows.some(function (m) { return m.id === row.id; });
        if (!known) {
          mediaRows.unshift(row);
          select.insertBefore(new Option(mediaLabel(row), String(row.id)), select.options[1]);
        }
        select.value = String(row.id);
      })
      .catch(function (err) { alert(err.message); })
      .finally(function () {
        file.disabled = false;
        file.value = "";
      });
  });

  var root = el("div", "auth-field");
  root.appendChild(select);
  root.appendChild(file);

  return {
    root: root,
    read: function () { return Number(select.value) || 0; }
  };
}

// ---------------------------------------------------------------------------
// Small form helpers, all el()-based.
// ---------------------------------------------------------------------------

function pField(labelText, input) {
  var wrap = el("div", "auth-field");
  wrap.appendChild(el("label", "auth-field__label", labelText));
  wrap.appendChild(input);
  return wrap;
}

function pInput(value, maxLength) {
  var input = el("input", "auth-field__input");
  input.type = "text";
  if (maxLength) input.maxLength = maxLength;
  input.value = value || "";
  return input;
}

function pArea(value, rows) {
  var area = el("textarea", "auth-field__input");
  area.rows = rows || 4;
  area.value = value || "";
  return area;
}

function pSelect(options, value) {
  var select = el("select", "auth-field__input");
  options.forEach(function (opt) {
    select.appendChild(new Option(opt[1], opt[0]));
  });
  select.value = value || "";
  return select;
}

function pCheck(labelText, checked) {
  var label = el("label", "auth-field__label");
  var input = el("input");
  input.type = "checkbox";
  input.checked = !!checked;
  label.appendChild(input);
  label.appendChild(document.createTextNode(" " + labelText));
  return { root: label, input: input };
}

function splitLines(value) {
  return value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
}

function splitParas(value) {
  return value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

function openProjectEditor(id) {
  var host = document.getElementById("project-editor");
  var list = document.getElementById("projects-list");

  Promise.all([
    api("/admin/projects/" + id).then(function (r) {
      if (!r.ok) throw new Error("Could not load the project.");
      return r.json();
    }),
    api("/admin/media").then(function (r) { return r.json(); })
  ])
    .then(function (results) {
      list.hidden = true;
      host.hidden = false;
      buildProjectEditor(host, results[0], results[1].rows || []);
    })
    .catch(function (err) { alert(err.message); });
}

function closeProjectEditor() {
  document.getElementById("project-editor").hidden = true;
  document.getElementById("projects-list").hidden = false;
  reload("projects");
}

function buildProjectEditor(host, record, mediaRows) {
  host.textContent = "";

  var cards = [];   // ordered block cards, each with .root and .read()
  var chipRows = []; // ordered chip rows

  // --- toolbar ------------------------------------------------------------
  var toolbar = el("div", "admin-actions");
  var statusNote = el("p", "admin-note");

  function setStatus(text) { statusNote.textContent = text; }

  function describe() {
    if (!record.publishedAt) return "Draft — not on the site yet.";
    var s = "Published " + when(record.publishedAt) + " as project-" + record.slug + ".html.";
    if (record.updatedAt > record.publishedAt) s += " Saved edits are not published yet.";
    return s;
  }

  toolbar.appendChild(button("← Back", "", function () { closeProjectEditor(); }));

  toolbar.appendChild(button("Save", "admin-btn--accent", function () {
    saveProject().then(function () {
      setStatus("Saved. " + describe());
    }).catch(function (err) { alert(err.message); });
  }));

  toolbar.appendChild(button("Preview", "", function () {
    // Opened synchronously so the click still counts as a user gesture —
    // window.open after the async save would be popup-blocked.
    var tab = window.open("about:blank", "_blank");
    saveProject().then(function () {
      var url = "/api/admin/projects/" + record.id + "/preview";
      if (tab) tab.location = url;
      else window.open(url, "_blank");
    }).catch(function (err) {
      if (tab) tab.close();
      alert(err.message);
    });
  }));

  toolbar.appendChild(button(record.publishedAt ? "Publish again" : "Publish", "admin-btn--accent", function () {
    saveProject().then(function () {
      if (!confirm("Publish project-" + record.slug + ".html to the live site?")) return null;
      return api("/admin/projects/" + record.id + "/publish", { method: "POST" })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (b) { throw new Error(b.message || "Publish failed."); });
          openProjectEditor(record.id);
        });
    }).catch(function (err) { alert(err.message); });
  }));

  if (record.publishedAt) {
    toolbar.appendChild(button("Unpublish", "", function () {
      if (!confirm("Take project-" + record.slug + ".html off the site?")) return;
      api("/admin/projects/" + record.id + "/unpublish", { method: "POST" })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (b) { alert(b.message || "Failed."); });
          openProjectEditor(record.id);
        });
    }));
  }

  host.appendChild(toolbar);
  setStatus(describe());
  host.appendChild(statusNote);

  // --- head fields ----------------------------------------------------------
  host.appendChild(el("h2", "box__label admin-subhead", "Page head"));

  var titleInput = pInput(record.title, 120);
  var slugInput = pInput(record.slug, 48);
  slugInput.disabled = !!record.publishedAt;
  if (slugInput.disabled) slugInput.title = "The slug is the published filename. Unpublish to change it.";

  var statusSelect = pSelect([["", "—"], ["WIP", "WIP"], ["Featured", "Featured"]], record.status);
  var paletteSelect = pSelect(
    [["", "—"]].concat(PALETTES.map(function (p) { return [p, p]; })),
    record.palette
  );
  var orderInput = el("input", "auth-field__input");
  orderInput.type = "number";
  orderInput.min = "0";
  orderInput.value = record.sortOrder;
  var visibleCheck = pCheck("Listed on projects.html and in pagers", record.visible);

  var headForm = el("div", "admin-form");
  headForm.appendChild(pField("Title", titleInput));
  headForm.appendChild(pField("Slug", slugInput));
  headForm.appendChild(pField("Status chip", statusSelect));
  headForm.appendChild(pField("Palette (colour set in style.css)", paletteSelect));
  headForm.appendChild(pField("Sort order (position among projects)", orderInput));
  headForm.appendChild(visibleCheck.root);
  host.appendChild(headForm);

  var ledeArea = pArea(record.lede, 2);
  var blurbArea = pArea(record.cardBlurb, 2);
  var proseForm = el("div", "admin-form");
  proseForm.appendChild(pField("Lede — the one-sentence pitch at the top of the page", ledeArea));
  proseForm.appendChild(pField("Card blurb — the line on the projects.html card", blurbArea));
  host.appendChild(proseForm);

  var markupNote = el("p", "admin-note",
    "In any prose field: [text](url) makes a link, `text` makes code. Everything else is plain text — HTML is never interpreted.");
  host.appendChild(markupNote);

  // --- chips ----------------------------------------------------------------
  host.appendChild(el("h2", "box__label admin-subhead", "Tech chips"));
  var chipsHost = el("div");
  host.appendChild(chipsHost);

  function addChipRow(chip) {
    var labelInput = pInput(chip.label, 60);
    var iconSelect = pSelect(
      [["", "no icon"]].concat(CHIP_ICONS.map(function (n) { return [n, n]; })),
      chip.icon
    );

    var row = el("div", "admin-form");
    row.appendChild(pField("Label", labelInput));
    row.appendChild(pField("Icon", iconSelect));

    var entry = {
      root: row,
      read: function () {
        var label = labelInput.value.trim();
        if (!label) return null;
        return { label: label, icon: iconSelect.value || null };
      }
    };

    var remove = el("div", "auth-field");
    remove.appendChild(button("✕ Remove chip", "", function () {
      chipsHost.removeChild(row);
      chipRows.splice(chipRows.indexOf(entry), 1);
    }));
    row.appendChild(remove);

    chipRows.push(entry);
    chipsHost.appendChild(row);
  }

  (record.chips || []).forEach(addChipRow);
  var addChip = button("+ Add chip", "", function () { addChipRow({ label: "", icon: null }); });
  host.appendChild(addChip);

  // --- blocks -----------------------------------------------------------
  host.appendChild(el("h2", "box__label admin-subhead", "Blocks"));
  host.appendChild(el("p", "admin-note",
    "Rendered top to bottom. Whatever the order here, the page always ends with: facts strip, downloads, links, pager — the fixed shape every project page has."));

  var blocksHost = el("div");
  host.appendChild(blocksHost);

  function repaintBlocks() {
    blocksHost.textContent = "";
    cards.forEach(function (c) { blocksHost.appendChild(c.root); });
  }

  function addBlockCard(block) {
    var entry = buildBlockCard(block, mediaRows, {
      moveUp: function () {
        var i = cards.indexOf(entry);
        if (i > 0) { cards.splice(i, 1); cards.splice(i - 1, 0, entry); repaintBlocks(); }
      },
      moveDown: function () {
        var i = cards.indexOf(entry);
        if (i < cards.length - 1) { cards.splice(i, 1); cards.splice(i + 1, 0, entry); repaintBlocks(); }
      },
      remove: function () {
        if (!confirm("Remove this block?")) return;
        cards.splice(cards.indexOf(entry), 1);
        repaintBlocks();
      }
    });
    cards.push(entry);
    blocksHost.appendChild(entry.root);
  }

  (record.blocks || []).forEach(addBlockCard);

  var adderSelect = pSelect(BLOCK_TYPES, "section");
  var adder = el("div", "admin-form");
  adder.appendChild(pField("Add a block", adderSelect));
  var addWrap = el("div", "auth-field");
  addWrap.appendChild(button("+ Add", "admin-btn--accent", function () {
    addBlockCard({ type: adderSelect.value });
  }));
  adder.appendChild(addWrap);
  host.appendChild(adder);

  // --- save -----------------------------------------------------------------
  function saveProject() {
    var body = {
      title: titleInput.value.trim(),
      status: statusSelect.value || null,
      palette: paletteSelect.value || null,
      lede: ledeArea.value.trim() || null,
      cardBlurb: blurbArea.value.trim() || null,
      sortOrder: Number(orderInput.value) || 0,
      visible: visibleCheck.input.checked,
      chips: chipRows.map(function (c) { return c.read(); }).filter(Boolean),
      blocks: cards.map(function (c) { return c.read(); })
    };
    if (!slugInput.disabled) body.slug = slugInput.value.trim();

    if (!body.title) return Promise.reject(new Error("The page needs a title."));

    return api("/admin/projects/" + record.id, { method: "PUT", body: body })
      .then(function (res) {
        if (res.ok) return null;
        return res.json().then(function (b) { throw new Error(b.message || "Could not save."); });
      });
  }
}

// One bordered card per block: a header with the type name and the reorder /
// remove controls, then the type's own fields. Returns { root, read }.
function buildBlockCard(block, mediaRows, controls) {
  var root = el("div", "box box--static");

  var name = "";
  BLOCK_TYPES.forEach(function (t) { if (t[0] === block.type) name = t[1]; });

  var head = el("div", "admin-actions");
  head.appendChild(el("span", "box__label", name || block.type));
  head.appendChild(button("↑", "", controls.moveUp));
  head.appendChild(button("↓", "", controls.moveDown));
  head.appendChild(button("✕", "", controls.remove));
  root.appendChild(head);

  var read;

  function form() {
    var f = el("div", "admin-form");
    root.appendChild(f);
    return f;
  }

  function hint(text) {
    root.appendChild(el("p", "admin-note", text));
  }

  switch (block.type) {
    case "section": {
      var heading = pInput(block.heading, 120);
      var body = pArea((block.body || []).join("\n\n"), 6);
      var noteText = pInput(block.note ? block.note.text : "", 4000);
      var accent = pCheck("Accent border (WIP / caveat notice)", block.note && block.note.accent);

      var f1 = form();
      f1.appendChild(pField("Heading", heading));
      var f2 = form();
      f2.appendChild(pField("Paragraphs — separate with a blank line", body));
      var f3 = form();
      f3.appendChild(pField("Note (optional aside, shown boxed under the text)", noteText));
      f3.appendChild(accent.root);

      read = function () {
        return {
          type: "section",
          heading: heading.value.trim(),
          body: splitParas(body.value),
          note: noteText.value.trim()
            ? { text: noteText.value.trim(), accent: accent.input.checked }
            : null
        };
      };
      break;
    }

    case "steps": {
      var sHeading = pInput(block.heading, 120);
      var sItems = pArea((block.items || []).map(function (it) {
        return it.lead ? it.lead + " — " + it.text : it.text;
      }).join("\n"), 6);

      var sf = form();
      sf.appendChild(pField("Heading", sHeading));
      var sf2 = form();
      sf2.appendChild(pField("Steps — one per line", sItems));
      hint("A line like “Base pass — 8 steps at denoise 1.0” gets a bold lead. No “ — ”, no lead.");

      read = function () {
        return {
          type: "steps",
          heading: sHeading.value.trim(),
          items: splitLines(sItems.value).map(function (line) {
            var cut = line.indexOf(" — ");
            if (cut === -1) return { lead: null, text: line };
            return { lead: line.slice(0, cut).trim(), text: line.slice(cut + 3).trim() };
          })
        };
      };
      break;
    }

    case "features": {
      var fHeading = pInput(block.heading, 120);
      var fItems = pArea((block.items || []).join("\n"), 5);

      var ff = form();
      ff.appendChild(pField("Heading", fHeading));
      var ff2 = form();
      ff2.appendChild(pField("Features — one per line, short, no sentences", fItems));

      read = function () {
        return { type: "features", heading: fHeading.value.trim(), items: splitLines(fItems.value) };
      };
      break;
    }

    case "table": {
      var tHeading = pInput(block.heading, 120);
      var tLines = [(block.columns || []).join(" | ")]
        .concat((block.rows || []).map(function (r) { return r.join(" | "); }))
        .filter(Boolean);
      var tArea = pArea(tLines.join("\n"), 6);

      var tf = form();
      tf.appendChild(pField("Heading", tHeading));
      var tf2 = form();
      tf2.appendChild(pField("Rows — first line is the header, cells separated by |", tArea));

      read = function () {
        var lines = splitLines(tArea.value).map(function (line) {
          return line.split("|").map(function (c) { return c.trim(); });
        });
        return {
          type: "table",
          heading: tHeading.value.trim(),
          columns: lines.length ? lines[0] : [],
          rows: lines.slice(1)
        };
      };
      break;
    }

    case "figure": {
      var fig = mediaPicker(mediaRows, block.mediaId, "image/*");
      var figAlt = pArea(block.alt, 2);
      var figCaption = pInput(block.caption, 300);

      var gf = form();
      gf.appendChild(pField("Image", fig.root));
      var gf2 = form();
      gf2.appendChild(pField("Alt text — describe what is shown", figAlt));
      gf2.appendChild(pField("Caption", figCaption));

      read = function () {
        return {
          type: "figure",
          mediaId: fig.read(),
          alt: figAlt.value.trim(),
          caption: figCaption.value.trim()
        };
      };
      break;
    }

    case "media": {
      var mHeading = pInput(block.heading, 120);
      var mf = form();
      mf.appendChild(pField("Band heading (e.g. “Walkthrough”, “My setup”)", mHeading));
      hint("Closed by default on the page; the clip count and size under the heading are computed, not typed. GIFs render as plain rows, MP4s get pause / fullscreen controls.");

      var rowsHost = el("div");
      root.appendChild(rowsHost);
      var rowEntries = [];

      var addRow = function (row) {
        var picker = mediaPicker(mediaRows, row.mediaId, "image/*,video/mp4");
        var title = pInput(row.title, 120);
        var alt = pArea(row.alt, 2);
        var body = pArea((row.body || []).join("\n\n"), 4);
        var wide = pCheck("Wide row (full-width frame, like the ComfyUI clip)", row.wide);

        var card = el("div", "box box--static");
        var rowHead = el("div", "admin-actions");
        rowHead.appendChild(el("span", "box__label", "Clip"));
        var entry = {
          root: card,
          read: function () {
            return {
              mediaId: picker.read(),
              title: title.value.trim(),
              alt: alt.value.trim(),
              body: splitParas(body.value),
              wide: wide.input.checked
            };
          }
        };
        rowHead.appendChild(button("✕", "", function () {
          rowsHost.removeChild(card);
          rowEntries.splice(rowEntries.indexOf(entry), 1);
        }));
        card.appendChild(rowHead);

        var rf = el("div", "admin-form");
        rf.appendChild(pField("File (GIF, image or MP4)", picker.root));
        rf.appendChild(pField("Row title", title));
        card.appendChild(rf);
        var rf2 = el("div", "admin-form");
        rf2.appendChild(pField("Alt text", alt));
        rf2.appendChild(pField("Paragraphs beside the clip — blank line between them", body));
        card.appendChild(rf2);
        var rf3 = el("div", "admin-form");
        rf3.appendChild(wide.root);
        card.appendChild(rf3);

        rowEntries.push(entry);
        rowsHost.appendChild(card);
      };

      (block.rows || []).forEach(addRow);
      root.appendChild(button("+ Add clip", "", function () { addRow({}); }));

      read = function () {
        return {
          type: "media",
          heading: mHeading.value.trim(),
          rows: rowEntries.map(function (r) { return r.read(); })
        };
      };
      break;
    }

    case "datarow": {
      var dLines = (block.cells || []).map(function (c) { return c.key + " | " + c.value; });
      var dArea = pArea(dLines.join("\n"), 4);

      var df = form();
      df.appendChild(pField("Facts — one per line as “Key | Value”, 3–4 reads best", dArea));

      read = function () {
        return {
          type: "datarow",
          cells: splitLines(dArea.value).map(function (line) {
            var cut = line.indexOf("|");
            if (cut === -1) return { key: line.trim(), value: "" };
            return { key: line.slice(0, cut).trim(), value: line.slice(cut + 1).trim() };
          })
        };
      };
      break;
    }

    case "files": {
      var flHeading = pInput(block.heading || "Downloads", 120);
      var flf = form();
      flf.appendChild(pField("Heading", flHeading));

      var itemsHost = el("div");
      root.appendChild(itemsHost);
      var itemEntries = [];

      var addFileItem = function (item) {
        var picker = mediaPicker(mediaRows, item.mediaId, "");
        var label = pInput(item.label, 120);
        var note = pInput(item.note, 300);

        var rowEl = el("div", "admin-form");
        rowEl.appendChild(pField("File", picker.root));
        rowEl.appendChild(pField("Label", label));
        rowEl.appendChild(pField("Note (optional gloss)", note));

        var entry = {
          root: rowEl,
          read: function () {
            return { mediaId: picker.read(), label: label.value.trim(), note: note.value.trim() || null };
          }
        };
        var rm = el("div", "auth-field");
        rm.appendChild(button("✕ Remove", "", function () {
          itemsHost.removeChild(rowEl);
          itemEntries.splice(itemEntries.indexOf(entry), 1);
        }));
        rowEl.appendChild(rm);

        itemEntries.push(entry);
        itemsHost.appendChild(rowEl);
      };

      (block.items || []).forEach(addFileItem);
      root.appendChild(button("+ Add download", "", function () { addFileItem({}); }));

      read = function () {
        return {
          type: "files",
          heading: flHeading.value.trim(),
          items: itemEntries.map(function (i) { return i.read(); })
        };
      };
      break;
    }

    case "links": {
      var lHeading = pInput(block.heading || "Links", 120);
      var lf = form();
      lf.appendChild(pField("Heading", lHeading));

      var linksHost = el("div");
      root.appendChild(linksHost);
      var linkEntries = [];

      var addLinkItem = function (item) {
        var label = pInput(item.label, 120);
        var href = pInput(item.href, 600);
        var note = pInput(item.note, 300);

        var rowEl = el("div", "admin-form");
        rowEl.appendChild(pField("Label", label));
        rowEl.appendChild(pField("URL", href));
        rowEl.appendChild(pField("Note (optional gloss)", note));

        var entry = {
          root: rowEl,
          read: function () {
            return { label: label.value.trim(), href: href.value.trim(), note: note.value.trim() || null };
          }
        };
        var rm = el("div", "auth-field");
        rm.appendChild(button("✕ Remove", "", function () {
          linksHost.removeChild(rowEl);
          linkEntries.splice(linkEntries.indexOf(entry), 1);
        }));
        rowEl.appendChild(rm);

        linkEntries.push(entry);
        linksHost.appendChild(rowEl);
      };

      (block.items || []).forEach(addLinkItem);
      root.appendChild(button("+ Add link", "", function () { addLinkItem({}); }));

      read = function () {
        return {
          type: "links",
          heading: lHeading.value.trim(),
          items: linkEntries.map(function (i) { return i.read(); })
        };
      };
      break;
    }

    default: {
      hint("Unknown block type “" + block.type + "” — it will be kept as-is.");
      read = function () { return block; };
    }
  }

  return { root: root, read: read };
}
