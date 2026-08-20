/* ---------------------------------------------------------
   TransitPass — Cloud-Based Bus Pass System
   Storage: browser localStorage (acts as the "database" since
   GitHub Pages only serves static files, no backend server).
   Swap STORE.* functions for Firebase/Supabase calls later if
   you want true multi-device cloud storage.
--------------------------------------------------------- */

const STORAGE_KEY = "transitpass_applications";
const PASS_VALIDITY_DAYS = 30;

const STORE = {
  getAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },
  add(record) {
    const list = this.getAll();
    list.push(record);
    this.saveAll(list);
  },
  update(id, changes) {
    const list = this.getAll();
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1) {
      list[idx] = { ...list[idx], ...changes };
      this.saveAll(list);
    }
  },
  findByStudentId(studentId) {
    return this.getAll()
      .filter(r => r.studentId.toLowerCase() === studentId.trim().toLowerCase())
      .sort((a, b) => b.appliedDate - a.appliedDate)[0] || null;
  }
};

/* ---------------- Tab navigation ---------------- */
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("view-" + tab.dataset.view).classList.add("active");
    if (tab.dataset.view === "admin") renderAdmin();
  });
});

/* ---------------- Apply form ---------------- */
const applyForm = document.getElementById("applyForm");
const applyNote = document.getElementById("applyNote");

applyForm.addEventListener("submit", e => {
  e.preventDefault();

  const studentId = document.getElementById("studentId").value.trim();
  const existing = STORE.findByStudentId(studentId);
  if (existing && existing.status !== "rejected") {
    applyNote.textContent = "An application already exists for this Student ID.";
    applyNote.className = "form-note warn";
    return;
  }

  const record = {
    id: crypto.randomUUID(),
    fullName: document.getElementById("fullName").value.trim(),
    studentId,
    route: document.getElementById("route").value,
    phone: document.getElementById("phone").value.trim(),
    status: "pending",
    appliedDate: Date.now(),
    expiryDate: null
  };

  STORE.add(record);
  applyForm.reset();
  applyNote.textContent = "Application submitted. Check status under \"My Pass\".";
  applyNote.className = "form-note ok";
  toast("✓ Application submitted");
});

/* ---------------- My Pass lookup ---------------- */
document.getElementById("lookupBtn").addEventListener("click", doLookup);
document.getElementById("lookupId").addEventListener("keydown", e => {
  if (e.key === "Enter") doLookup();
});

function doLookup() {
  const id = document.getElementById("lookupId").value.trim();
  const result = document.getElementById("passResult");
  if (!id) { result.innerHTML = `<p class="pass-empty">Enter a student ID to look up your pass.</p>`; return; }

  const record = STORE.findByStudentId(id);
  if (!record) {
    result.innerHTML = `<p class="pass-empty">No application found for "${escapeHtml(id)}".</p>`;
    return;
  }
  result.innerHTML = renderPassCard(record);

  const renewBtn = document.getElementById("renewBtn");
  if (renewBtn) {
    renewBtn.addEventListener("click", () => {
      STORE.update(record.id, {
        expiryDate: Date.now() + PASS_VALIDITY_DAYS * 86400000,
        status: "approved"
      });
      doLookup();
      toast("✓ Pass renewed for 30 days");
    });
  }
}

function renderPassCard(record) {
  const status = computeStatus(record);
  const bars = Array.from({ length: 40 }, () =>
    `<i style="height:${8 + Math.random() * 26}px"></i>`
  ).join("");

  const expiryLine = record.expiryDate
    ? new Date(record.expiryDate).toLocaleDateString()
    : "—";

  const showRenew = status === "expired" || (status === "approved" && daysLeft(record) <= 5);

  return `
    <div class="pass-card">
      <div class="pass-top">
        <div>
          <div class="pass-route">${escapeHtml(record.route || "—")}</div>
          <p class="pass-name">${escapeHtml(record.fullName)}</p>
        </div>
        <span class="pass-status status-${status}">${status}</span>
      </div>
      <div class="pass-meta">
        <div><span>Student ID</span>${escapeHtml(record.studentId)}</div>
        <div><span>Phone</span>${escapeHtml(record.phone)}</div>
        <div><span>Applied</span>${new Date(record.appliedDate).toLocaleDateString()}</div>
        <div><span>Valid until</span>${expiryLine}</div>
      </div>
      <div class="barcode">${bars}</div>
      ${showRenew ? `<button id="renewBtn" class="btn-primary renew-btn">${status === "expired" ? "Renew pass" : "Renew early"}</button>` : ""}
    </div>
  `;
}

function computeStatus(record) {
  if (record.status === "pending") return "pending";
  if (record.status === "rejected") return "rejected";
  if (record.status === "approved") {
    if (record.expiryDate && record.expiryDate < Date.now()) return "expired";
    return "approved";
  }
  return record.status;
}

function daysLeft(record) {
  if (!record.expiryDate) return 0;
  return Math.ceil((record.expiryDate - Date.now()) / 86400000);
}

/* ---------------- Admin ---------------- */
function renderAdmin() {
  const list = STORE.getAll().sort((a, b) => b.appliedDate - a.appliedDate);
  const stats = document.getElementById("adminStats");
  const container = document.getElementById("adminList");

  const counts = {
    pending: list.filter(r => r.status === "pending").length,
    approved: list.filter(r => computeStatus(r) === "approved").length,
    expired: list.filter(r => computeStatus(r) === "expired").length,
    rejected: list.filter(r => r.status === "rejected").length
  };

  stats.innerHTML = `
    <div class="stat"><b>${counts.pending}</b><span>Pending</span></div>
    <div class="stat"><b>${counts.approved}</b><span>Active</span></div>
    <div class="stat"><b>${counts.expired}</b><span>Expired</span></div>
    <div class="stat"><b>${counts.rejected}</b><span>Rejected</span></div>
  `;

  if (list.length === 0) {
    container.innerHTML = `<p class="empty-note">No applications yet. Submit one from the Apply tab.</p>`;
    return;
  }

  container.innerHTML = list.map(r => {
    const status = computeStatus(r);
    let actions = "";
    if (r.status === "pending") {
      actions = `
        <button class="btn-approve" data-action="approve" data-id="${r.id}">Approve</button>
        <button class="btn-reject" data-action="reject" data-id="${r.id}">Reject</button>`;
    } else if (status === "approved" || status === "expired") {
      actions = `<button class="btn-revoke" data-action="revoke" data-id="${r.id}">Revoke</button>`;
    }
    return `
      <div class="admin-item">
        <div>
          <div class="who">${escapeHtml(r.fullName)} <span class="pass-status status-${status}" style="margin-left:8px;">${status}</span></div>
          <div class="meta">${escapeHtml(r.studentId)} · ${escapeHtml(r.route || "no route")}</div>
        </div>
        <div class="admin-actions">${actions}</div>
      </div>`;
  }).join("");

  container.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "approve") {
        STORE.update(id, { status: "approved", expiryDate: Date.now() + PASS_VALIDITY_DAYS * 86400000 });
        toast("✓ Pass approved");
      } else if (action === "reject") {
        STORE.update(id, { status: "rejected", expiryDate: null });
        toast("Application rejected");
      } else if (action === "revoke") {
        STORE.update(id, { status: "rejected", expiryDate: null });
        toast("Pass revoked");
      }
      renderAdmin();
    });
  });
}

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ---------------- Init ---------------- */
renderAdmin();
