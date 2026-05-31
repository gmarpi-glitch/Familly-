const STORAGE_KEY = "family-agent-state-v1";
const SESSION_KEY = "family-agent-session-v1";

const COLORS = ["#21635f", "#3f6fb5", "#d5653f", "#c18b1c", "#7a5ba8", "#407f58"];
const DAYS = [
  { value: 1, short: "Lun", long: "lundi" },
  { value: 2, short: "Mar", long: "mardi" },
  { value: 3, short: "Mer", long: "mercredi" },
  { value: 4, short: "Jeu", long: "jeudi" },
  { value: 5, short: "Ven", long: "vendredi" },
  { value: 6, short: "Sam", long: "samedi" },
  { value: 0, short: "Dim", long: "dimanche" },
];

const initialUi = {
  authMode: "login",
  view: "wall",
  weekOffset: 0,
  sidebarOpen: false,
};

let state = loadState();
let session = loadSession();
let ui = { ...initialUi };
let watchTimer = null;
let toastTimer = null;
let installPrompt = null;

const app = document.querySelector("#app");

document.addEventListener("DOMContentLoaded", () => {
  seedDemo(false);
  if (!session && getInviteCodeFromUrl()) ui.authMode = "signup";
  registerServiceWorker();
  render();
  startDueWatcher();
});

window.addEventListener?.("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  showToast("Family agent peut etre installe sur ce telephone.");
});

window.addEventListener?.("appinstalled", () => {
  installPrompt = null;
  showToast("Family agent est installe.");
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  const action = form.dataset.submit;

  try {
    if (action === "login") await handleLogin(data);
    if (action === "signup") await handleSignup(form);
    if (action === "appointment") handleAppointment(form);
    if (action === "reminder") handleReminder(form);
    if (action === "grocery") handleGrocery(form);
    if (action === "profile") await handleProfile(form);
  } catch (error) {
    showToast(error.message || "Action impossible.");
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === "set-auth-mode") {
    ui.authMode = target.dataset.mode;
    render();
  }

  if (action === "demo") {
    seedDemo(true);
    session = { userId: "user-camille" };
    saveSession();
    ui = { ...initialUi };
    render();
    showToast("Mode demo ouvert.");
  }

  if (action === "logout") {
    session = null;
    saveSession();
    ui = { ...initialUi };
    render();
  }

  if (action === "switch-view") {
    ui.view = target.dataset.view;
    ui.sidebarOpen = false;
    render();
  }

  if (action === "toggle-sidebar") {
    ui.sidebarOpen = !ui.sidebarOpen;
    render();
  }

  if (action === "close-sidebar") {
    ui.sidebarOpen = false;
    render();
  }

  if (action === "week-prev") {
    ui.weekOffset -= 1;
    renderView();
  }

  if (action === "week-next") {
    ui.weekOffset += 1;
    renderView();
  }

  if (action === "week-today") {
    ui.weekOffset = 0;
    renderView();
  }

  if (action === "delete-appointment") {
    mutateFamily((family) => {
      family.appointments = family.appointments.filter((item) => item.id !== id);
      addActivity(family, "Rendez-vous supprime");
    });
  }

  if (action === "delete-reminder") {
    mutateFamily((family) => {
      family.reminders = family.reminders.filter((item) => item.id !== id);
      addActivity(family, "Rappel supprime");
    });
  }

  if (action === "done-reminder") {
    mutateFamily((family) => {
      const reminder = family.reminders.find((item) => item.id === id);
      if (reminder) {
        reminder.lastDoneAt = new Date().toISOString();
        addActivity(family, `${reminder.title} marque comme fait`);
      }
    });
  }

  if (action === "send-appointment") sendAppointment(id);
  if (action === "send-reminder") sendReminder(id);

  if (action === "copy-code") {
    const family = getCurrentFamily();
    await copyText(family.code);
    showToast("Code famille copie.");
  }

  if (action === "copy-invite") {
    await copyText(getInviteLink());
    showToast("Lien d'invitation copie.");
  }

  if (action === "share-invite") {
    const message = getInviteMessage();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    showToast("Invitation WhatsApp preparee.");
  }

  if (action === "copy-export") {
    await copyText(JSON.stringify(state, null, 2));
    showToast("Donnees copiees.");
  }

  if (action === "request-notifications") requestNotifications();

  if (action === "install-app") installApp();

  if (action === "clear-bought") {
    mutateFamily((family) => {
      family.groceries = family.groceries.filter((item) => !item.checked);
      addActivity(family, "Liste de courses nettoyee");
    });
  }

  if (action === "delete-grocery") {
    mutateFamily((family) => {
      family.groceries = family.groceries.filter((item) => item.id !== id);
    });
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches("[data-action='toggle-grocery']")) {
    const id = target.dataset.id;
    mutateFamily((family) => {
      const item = family.groceries.find((entry) => entry.id === id);
      if (item) {
        item.checked = target.checked;
        item.checkedBy = target.checked ? getCurrentUser().id : "";
        item.checkedAt = target.checked ? new Date().toISOString() : "";
      }
    });
  }

  if (target.matches("[data-action='update-appointment-time']")) {
    const id = target.dataset.id;
    const field = target.dataset.field;
    mutateFamily((family) => {
      const item = family.appointments.find((entry) => entry.id === id);
      if (item && (field === "time" || field === "endTime")) {
        item[field] = target.value;
        addActivity(family, `Heure modifiee : ${item.title}`);
      }
    });
    showToast("Heure du rendez-vous modifiee.");
  }

  if (target.matches("[data-action='update-reminder-time']")) {
    const id = target.dataset.id;
    mutateFamily((family) => {
      const item = family.reminders.find((entry) => entry.id === id);
      if (item) {
        item.time = target.value;
        addActivity(family, `Heure du rappel modifiee : ${item.title}`);
      }
    });
    showToast("Heure du rappel modifiee.");
  }
});

function render() {
  if (!session || !getCurrentUser()) {
    app.innerHTML = renderAuth();
    return;
  }

  app.innerHTML = renderShell();
}

function renderView() {
  const container = document.querySelector("#view");
  if (container) container.innerHTML = renderCurrentView();
}

function renderAuth() {
  const isLogin = ui.authMode === "login";
  return `
    <main class="auth-screen">
      <section class="auth-visual">
        <div class="brand-lockup">
          <span class="brand-mark">FA</span>
          <div>
            <strong>Family agent</strong>
            <small>Mur familial prive</small>
          </div>
        </div>
        <div class="auth-preview">
          <h1>Family agent</h1>
          <div class="mini-board" aria-hidden="true">
            <div class="mini-day"><span>Lundi</span><div class="mini-line"></div><div class="mini-line orange"></div></div>
            <div class="mini-day"><span>Mercredi</span><div class="mini-line blue"></div><div class="mini-line"></div></div>
            <div class="mini-day"><span>Samedi</span><div class="mini-line orange"></div><div class="mini-line blue"></div></div>
          </div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <h2>${isLogin ? "Connexion" : "Creation du compte"}</h2>
          <p>${isLogin ? "Accedez a votre espace famille." : "Creez un compte individuel et rattachez-le a une famille."}</p>
          <div class="segmented" role="tablist" aria-label="Authentification">
            <button class="${isLogin ? "active" : ""}" type="button" data-action="set-auth-mode" data-mode="login">Connexion</button>
            <button class="${!isLogin ? "active" : ""}" type="button" data-action="set-auth-mode" data-mode="signup">Compte</button>
          </div>
          ${isLogin ? renderLoginForm() : renderSignupForm()}
        </div>
      </section>
    </main>
  `;
}

function renderLoginForm() {
  return `
    <form data-submit="login">
      <div class="field-grid">
        <div class="field">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="login-password">Mot de passe</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required />
        </div>
      </div>
      <div class="auth-actions">
        <button class="btn primary" type="submit"><svg class="icon"><use href="#icon-lock"></use></svg>Entrer</button>
        <button class="btn ghost" type="button" data-action="demo"><svg class="icon"><use href="#icon-home"></use></svg>Demo</button>
      </div>
      <p class="hint">Demo : camille@demo.fr / demo</p>
    </form>
  `;
}

function renderSignupForm() {
  const inviteCode = getInviteCodeFromUrl();
  return `
    <form data-submit="signup">
      <p class="notice ${inviteCode ? "show" : ""}">Lien groupe detecte : le code famille est deja renseigne.</p>
      <div class="field-grid">
        <div class="field-grid two">
          <div class="field">
            <label for="signup-name">Prenom</label>
            <input id="signup-name" name="name" type="text" autocomplete="given-name" required />
          </div>
          <div class="field">
            <label for="signup-email">Email</label>
            <input id="signup-email" name="email" type="email" autocomplete="email" required />
          </div>
        </div>
        <div class="field-grid two">
          <div class="field">
            <label for="signup-password">Mot de passe</label>
            <input id="signup-password" name="password" type="password" autocomplete="new-password" minlength="4" required />
          </div>
          <div class="field">
            <label for="signup-family">Famille</label>
            <input id="signup-family" name="familyName" type="text" placeholder="Famille Martin" />
          </div>
        </div>
        <div class="field">
          <label for="signup-code">Code famille</label>
          <input id="signup-code" name="familyCode" type="text" value="${escapeAttribute(inviteCode)}" placeholder="Optionnel" />
        </div>
        <div class="field">
          <span class="field-title">Couleur</span>
          <div class="swatches">${renderSwatches("signup-color", COLORS[0])}</div>
        </div>
      </div>
      <div class="auth-actions">
        <button class="btn primary" type="submit"><svg class="icon"><use href="#icon-user"></use></svg>Creer</button>
      </div>
    </form>
  `;
}

function renderShell() {
  const user = getCurrentUser();
  const family = getCurrentFamily();
  const shellClass = ui.sidebarOpen ? "shell sidebar-open" : "shell";

  return `
    <div class="${shellClass}">
      <aside class="sidebar" aria-label="Navigation">
        <div class="brand-lockup">
          <span class="brand-mark">FA</span>
          <div>
            <strong>Family agent</strong>
            <div class="family-name">${escapeHtml(family.name)}</div>
          </div>
        </div>
        <nav class="tabs">
          ${renderTab("wall", "icon-sparkles", "Mur")}
          ${renderTab("schedule", "icon-calendar", "Planning")}
          ${renderTab("reminders", "icon-bell", "Rappels")}
          ${renderTab("groceries", "icon-list", "Courses")}
          ${renderTab("account", "icon-user", "Compte")}
        </nav>
        <section class="sidebar-section">
          <p class="section-label">Membres</p>
          <ul class="people-list">
            ${getFamilyUsers(family).map(renderPersonRow).join("")}
          </ul>
        </section>
        <section class="sidebar-section">
          <p class="section-label">Lien groupe</p>
          <div class="family-code">
            <code>${escapeHtml(family.code)}</code>
            <button class="btn ghost" type="button" title="Copier" data-action="copy-code"><svg class="icon"><use href="#icon-copy"></use></svg></button>
          </div>
          <button class="tab-btn invite-tab" type="button" data-action="copy-invite"><svg class="icon"><use href="#icon-copy"></use></svg>Copier le lien</button>
          <button class="tab-btn invite-tab" type="button" data-action="share-invite"><svg class="icon"><use href="#icon-send"></use></svg>Inviter WhatsApp</button>
        </section>
      </aside>
      <button class="sidebar-backdrop" type="button" aria-label="Fermer" data-action="close-sidebar"></button>
      <main class="main">
        <header class="topbar">
          <div class="user-strip">
            <button class="btn ghost icon-only mobile-menu" type="button" aria-label="Menu" data-action="toggle-sidebar"><svg class="icon"><use href="#icon-menu"></use></svg></button>
            <div>
              <h1>${titleForView()}</h1>
              <p class="date-subtitle">${formatLongDate(new Date())}</p>
            </div>
          </div>
          <div class="user-strip">
            <div class="user-pill">
              ${renderAvatar(user)}
              <span>${escapeHtml(user.name)}</span>
            </div>
            <button class="btn ghost icon-only" type="button" title="Se deconnecter" data-action="logout"><svg class="icon"><use href="#icon-log-out"></use></svg></button>
          </div>
        </header>
        <div class="content" id="view">${renderCurrentView()}</div>
        <nav class="bottom-nav" aria-label="Navigation mobile">
          ${renderBottomTab("wall", "icon-sparkles", "Mur")}
          ${renderBottomTab("schedule", "icon-calendar", "Agenda")}
          ${renderBottomTab("reminders", "icon-bell", "Rappels")}
          ${renderBottomTab("groceries", "icon-list", "Courses")}
          ${renderBottomTab("account", "icon-user", "Compte")}
        </nav>
      </main>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  `;
}

function renderTab(view, icon, label) {
  return `
    <button class="tab-btn ${ui.view === view ? "active" : ""}" type="button" data-action="switch-view" data-view="${view}">
      <svg class="icon"><use href="#${icon}"></use></svg>${label}
    </button>
  `;
}

function renderBottomTab(view, icon, label) {
  return `
    <button class="bottom-nav-btn ${ui.view === view ? "active" : ""}" type="button" data-action="switch-view" data-view="${view}">
      <svg class="icon"><use href="#${icon}"></use></svg>
      <span>${label}</span>
    </button>
  `;
}

function renderPersonRow(user) {
  return `
    <li class="person-row">
      ${renderAvatar(user)}
      <span>${escapeHtml(user.name)}</span>
    </li>
  `;
}

function renderAvatar(user, className = "avatar") {
  if (user.photo) {
    return `<span class="${className}" style="background:${user.color}"><img src="${escapeAttribute(user.photo)}" alt="" /></span>`;
  }
  return `<span class="${className}" style="background:${user.color}">${initials(user.name)}</span>`;
}

function renderCurrentView() {
  if (ui.view === "wall") return renderWallView();
  if (ui.view === "reminders") return renderRemindersView();
  if (ui.view === "groceries") return renderGroceriesView();
  if (ui.view === "account") return renderAccountView();
  return renderScheduleView();
}

function renderWallView() {
  const user = getCurrentUser();
  const family = getCurrentFamily();
  const todayKey = toDateInput(new Date());
  const todayAppointments = [...family.appointments]
    .filter((item) => item.date === todayKey)
    .sort(byDateTime);
  const dueReminders = remindersForDate(new Date()).sort((a, b) => a.time.localeCompare(b.time));
  const openGroceries = family.groceries.filter((item) => !item.checked);
  const nextAppointments = [...family.appointments]
    .filter((item) => new Date(`${item.date}T${item.time || "00:00"}`) >= new Date())
    .sort(byDateTime)
    .slice(0, 3);
  const focusCards = [
    { label: "Rendez-vous", value: todayAppointments.length, tone: "mint" },
    { label: "Rappels", value: dueReminders.length, tone: "sun" },
    { label: "Courses", value: openGroceries.length, tone: "rose" },
    { label: "Membres", value: getFamilyUsers(family).length, tone: "blue" },
  ];

  return `
    <section class="wall-hero">
      <div class="wall-hero-copy">
        <span class="eyebrow"><svg class="icon"><use href="#icon-sparkles"></use></svg>Mur familial</span>
        <h2>Bonjour ${escapeHtml(user.name)}, voici la maison aujourd'hui.</h2>
        <p>${todayAppointments.length + dueReminders.length ? "La journee est organisee, les rappels importants sont devant vous." : "Journee calme pour le moment, vous pouvez ajouter un rendez-vous ou un rappel."}</p>
        <div class="wall-actions">
          <button class="btn primary" type="button" data-action="switch-view" data-view="schedule"><svg class="icon"><use href="#icon-plus"></use></svg>Rendez-vous</button>
          <button class="btn ghost" type="button" data-action="switch-view" data-view="groceries"><svg class="icon"><use href="#icon-list"></use></svg>Courses</button>
          <button class="btn ghost" type="button" data-action="share-invite"><svg class="icon"><use href="#icon-send"></use></svg>Inviter</button>
        </div>
      </div>
      <div class="family-scene" aria-hidden="true">
        <div class="scene-roof"></div>
        <div class="scene-house">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="scene-note note-one"></div>
        <div class="scene-note note-two"></div>
      </div>
    </section>

    <section class="focus-grid" aria-label="Resume de la famille">
      ${focusCards.map((card) => `
        <article class="focus-card ${card.tone}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `).join("")}
    </section>

    <div class="wall-grid">
      <section class="panel wall-today">
        <div class="panel-header">
          <h2>Aujourd'hui</h2>
          <button class="btn ghost" type="button" data-action="switch-view" data-view="schedule"><svg class="icon"><use href="#icon-calendar"></use></svg>Planning</button>
        </div>
        <div class="panel-body stack">
          ${renderTodayAgenda(todayAppointments, dueReminders)}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Prochains moments</h2>
        </div>
        <div class="panel-body stack">
          ${nextAppointments.length ? nextAppointments.map(renderCompactAppointment).join("") : `<div class="empty-state">Aucun rendez-vous a venir</div>`}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Courses rapides</h2>
          <button class="btn ghost" type="button" data-action="switch-view" data-view="groceries"><svg class="icon"><use href="#icon-list"></use></svg>Voir</button>
        </div>
        <div class="panel-body stack">
          ${openGroceries.slice(0, 5).map(renderCompactGrocery).join("") || `<div class="empty-state">La liste est vide</div>`}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Dernieres nouvelles</h2>
        </div>
        <div class="panel-body stack">
          ${(family.activity || []).slice(0, 5).map(renderActivityItem).join("") || `<div class="empty-state">Aucune activite</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderTodayAgenda(appointments, reminders) {
  const entries = [
    ...appointments.map((item) => ({ type: "appointment", time: item.time, item })),
    ...reminders.map((item) => ({ type: "reminder", time: item.time, item })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  if (!entries.length) return `<div class="empty-state">Rien de prevu aujourd'hui</div>`;

  return entries.map((entry) => {
    if (entry.type === "appointment") return renderTimelineAppointment(entry.item);
    return renderTimelineReminder(entry.item);
  }).join("");
}

function renderTimelineAppointment(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  return `
    <article class="timeline-item" style="--owner-color:${owner.color}">
      <span class="timeline-time">${escapeHtml(item.time)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(owner.name)}${item.location ? ` · ${escapeHtml(item.location)}` : ""}</small>
      </div>
      <button class="btn ghost icon-only" type="button" title="Envoyer" data-action="send-appointment" data-id="${item.id}"><svg class="icon"><use href="#icon-send"></use></svg></button>
    </article>
  `;
}

function renderTimelineReminder(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  return `
    <article class="timeline-item reminder" style="--owner-color:${owner.color}">
      <span class="timeline-time">${escapeHtml(item.time)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(owner.name)} · ${channelLabel(item.channel)}</small>
      </div>
      <button class="btn ghost icon-only" type="button" title="Fait" data-action="done-reminder" data-id="${item.id}"><svg class="icon"><use href="#icon-check"></use></svg></button>
    </article>
  `;
}

function renderCompactAppointment(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  return `
    <article class="mini-row" style="--owner-color:${owner.color}">
      <span class="color-dot" style="background:${owner.color}"></span>
      <div class="row-title">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${formatShortDate(new Date(`${item.date}T00:00:00`))} · ${escapeHtml(item.time)} · ${escapeHtml(owner.name)}</small>
      </div>
    </article>
  `;
}

function renderCompactGrocery(item) {
  const addedBy = getUserById(item.addedBy);
  return `
    <article class="mini-row grocery-mini">
      <svg class="icon"><use href="#icon-list"></use></svg>
      <div class="row-title">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${[item.quantity, item.category, addedBy ? addedBy.name : ""].filter(Boolean).map(escapeHtml).join(" · ")}</small>
      </div>
    </article>
  `;
}

function renderActivityItem(item) {
  return `
    <article class="mini-row activity-mini">
      <svg class="icon"><use href="#icon-message"></use></svg>
      <div class="row-title">
        <strong>${escapeHtml(item.text)}</strong>
        <small>${formatLongDate(new Date(item.at))}</small>
      </div>
    </article>
  `;
}

function renderScheduleView() {
  const weekStart = getWeekStart(addDays(new Date(), ui.weekOffset * 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const family = getCurrentFamily();
  const appointments = [...family.appointments].sort(byDateTime);
  const weekLabel = `${formatShortDate(weekDays[0])} - ${formatShortDate(weekDays[6])}`;

  return `
    <div class="view-grid">
      <section class="panel">
        <div class="panel-header toolbar">
          <div>
            <h2>Semaine</h2>
            <div class="week-label">${weekLabel}</div>
          </div>
          <div class="week-controls">
            <button class="btn ghost icon-only" type="button" title="Semaine precedente" data-action="week-prev"><svg class="icon"><use href="#icon-chevron-left"></use></svg></button>
            <button class="btn ghost" type="button" data-action="week-today">Aujourd'hui</button>
            <button class="btn ghost icon-only" type="button" title="Semaine suivante" data-action="week-next"><svg class="icon"><use href="#icon-chevron-right"></use></svg></button>
          </div>
        </div>
        <div class="calendar-grid">
          ${weekDays.map((day) => renderDayColumn(day, appointments)).join("")}
        </div>
      </section>
      <aside class="panel">
        <div class="panel-header">
          <h2>Rendez-vous</h2>
        </div>
        <div class="panel-body">
          ${renderAppointmentForm()}
          ${renderAppointmentTimeBoard(appointments, weekDays)}
        </div>
      </aside>
    </div>
  `;
}

function renderDayColumn(day, appointments) {
  const key = toDateInput(day);
  const todaysEvents = appointments.filter((item) => item.date === key);
  const isToday = key === toDateInput(new Date());

  return `
    <section class="day-column ${isToday ? "today" : ""}">
      <div class="day-head">
        <strong>${dayName(day)}</strong>
        <span>${formatShortDate(day)}</span>
      </div>
      <div class="event-stack">
        ${
          todaysEvents.length
            ? todaysEvents.map(renderAppointmentCard).join("")
            : `<div class="empty-state">Libre</div>`
        }
      </div>
    </section>
  `;
}

function renderAppointmentCard(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  return `
    <article class="event-card" style="--owner-color:${owner.color}">
      <div class="event-time">
        <span>${escapeHtml(item.time)}${item.endTime ? ` - ${escapeHtml(item.endTime)}` : ""}</span>
        <span class="owner-chip" style="--owner-color:${owner.color}"><span class="color-dot" style="background:${owner.color}"></span>${escapeHtml(owner.name)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      ${item.location ? `<div class="event-meta">${escapeHtml(item.location)}</div>` : ""}
      ${item.notes ? `<div class="event-meta">${escapeHtml(item.notes)}</div>` : ""}
      <div class="event-actions">
        <button class="btn ghost icon-only" type="button" title="Envoyer" data-action="send-appointment" data-id="${item.id}"><svg class="icon"><use href="#icon-send"></use></svg></button>
        <button class="btn ghost icon-only" type="button" title="Supprimer" data-action="delete-appointment" data-id="${item.id}"><svg class="icon"><use href="#icon-trash"></use></svg></button>
      </div>
    </article>
  `;
}

function renderAppointmentForm() {
  const today = toDateInput(new Date());
  return `
    <form data-submit="appointment" class="field-grid">
      <div class="field">
        <label for="appointment-title">Titre</label>
        <input id="appointment-title" name="title" type="text" required placeholder="Dentiste, foot, visio..." />
      </div>
      <div class="field-grid two">
        <div class="field">
          <label for="appointment-date">Date</label>
          <input id="appointment-date" name="date" type="date" value="${today}" required />
        </div>
        <div class="field">
          <label for="appointment-time">Heure</label>
          <input id="appointment-time" name="time" type="time" value="18:00" required />
        </div>
      </div>
      <div class="field-grid two">
        <div class="field">
          <label for="appointment-end">Fin</label>
          <input id="appointment-end" name="endTime" type="time" />
        </div>
        <div class="field">
          <label for="appointment-owner">Personne</label>
          <select id="appointment-owner" name="ownerId">${renderUserOptions()}</select>
        </div>
      </div>
      <div class="field">
        <label for="appointment-location">Lieu</label>
        <input id="appointment-location" name="location" type="text" />
      </div>
      <div class="field">
        <label for="appointment-channel">Rappel</label>
        <select id="appointment-channel" name="channel">
          <option value="whatsapp">WhatsApp</option>
          <option value="copy">Copier le message</option>
          <option value="email">Email</option>
          <option value="browser">Notification navigateur</option>
        </select>
      </div>
      <div class="field">
        <label for="appointment-notes">Note</label>
        <textarea id="appointment-notes" name="notes"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit"><svg class="icon"><use href="#icon-plus"></use></svg>Ajouter</button>
      </div>
    </form>
  `;
}

function renderAppointmentTimeBoard(appointments, weekDays) {
  const weekKeys = new Set(weekDays.map(toDateInput));
  const weekAppointments = appointments.filter((item) => weekKeys.has(item.date));

  return `
    <details class="time-board">
      <summary>
        <span><svg class="icon"><use href="#icon-clock"></use></svg>Modifier les heures</span>
        <strong>${weekAppointments.length}</strong>
      </summary>
      <div class="time-table">
        ${
          weekAppointments.length
            ? weekAppointments.map(renderAppointmentTimeRow).join("")
            : `<div class="empty-state">Aucun rendez-vous cette semaine</div>`
        }
      </div>
    </details>
  `;
}

function renderAppointmentTimeRow(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  return `
    <div class="time-row">
      <div class="time-row-title">
        <span class="color-dot" style="background:${owner.color}"></span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${formatShortDate(new Date(`${item.date}T00:00:00`))} · ${escapeHtml(owner.name)}</small>
        </div>
      </div>
      <label>
        Debut
        <select data-action="update-appointment-time" data-id="${item.id}" data-field="time">
          ${renderTimeOptions(item.time)}
        </select>
      </label>
      <label>
        Fin
        <select data-action="update-appointment-time" data-id="${item.id}" data-field="endTime">
          ${renderTimeOptions(item.endTime, true)}
        </select>
      </label>
    </div>
  `;
}

function renderRemindersView() {
  const family = getCurrentFamily();
  const reminders = [...family.reminders].sort((a, b) => nextReminderDate(a) - nextReminderDate(b));
  return `
    <div class="view-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Rappels</h2>
          <button class="btn ghost" type="button" data-action="request-notifications"><svg class="icon"><use href="#icon-bell"></use></svg>Notifications</button>
        </div>
        <div class="panel-body stack">
          ${reminders.length ? reminders.map(renderReminderRow).join("") : `<div class="empty-state">Aucun rappel</div>`}
        </div>
      </section>
      <aside class="panel">
        <div class="panel-header">
          <h2>Nouveau rappel</h2>
        </div>
        <div class="panel-body">
          ${renderReminderForm()}
          ${renderReminderTimeBoard(reminders)}
        </div>
      </aside>
    </div>
  `;
}

function renderReminderRow(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  const next = nextReminderDate(item);
  return `
    <article class="reminder-row">
      <div class="row-main">
        <div class="row-title">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.notes || "Rappel familial")}</small>
        </div>
        <div class="row-actions">
          <button class="btn ghost icon-only" type="button" title="Envoyer" data-action="send-reminder" data-id="${item.id}"><svg class="icon"><use href="#icon-send"></use></svg></button>
          <button class="btn ghost icon-only" type="button" title="Fait" data-action="done-reminder" data-id="${item.id}"><svg class="icon"><use href="#icon-check"></use></svg></button>
          <button class="btn ghost icon-only" type="button" title="Supprimer" data-action="delete-reminder" data-id="${item.id}"><svg class="icon"><use href="#icon-trash"></use></svg></button>
        </div>
      </div>
      <div class="chip-line">
        <span class="owner-chip" style="--owner-color:${owner.color}"><span class="color-dot" style="background:${owner.color}"></span>${escapeHtml(owner.name)}</span>
        <span class="status-chip next">Prochain : ${formatReminderDate(next)}</span>
        ${item.lastDoneAt ? `<span class="status-chip done">Fait ${relativeDay(new Date(item.lastDoneAt))}</span>` : ""}
      </div>
      <div class="chip-line">
        ${item.days.map((day) => `<span class="day-chip">${dayLabel(day)}</span>`).join("")}
        <span class="day-chip">${escapeHtml(item.time)}</span>
        <span class="day-chip">${channelLabel(item.channel)}</span>
      </div>
    </article>
  `;
}

function renderReminderForm() {
  return `
    <form data-submit="reminder" class="field-grid">
      <div class="field">
        <label for="reminder-title">Titre</label>
        <input id="reminder-title" name="title" type="text" required placeholder="Poubelle jaune" />
      </div>
      <div class="field-grid two">
        <div class="field">
          <label for="reminder-time">Heure</label>
          <input id="reminder-time" name="time" type="time" value="20:00" required />
        </div>
        <div class="field">
          <label for="reminder-owner">Personne</label>
          <select id="reminder-owner" name="ownerId">${renderUserOptions()}</select>
        </div>
      </div>
      <div class="field">
        <span class="field-title">Jours</span>
        <div class="day-picker">
          ${DAYS.map((day) => `
            <label><input type="checkbox" name="days" value="${day.value}" ${day.value === 1 ? "checked" : ""} />${day.short}</label>
          `).join("")}
        </div>
      </div>
      <div class="field">
        <label for="reminder-channel">Envoi</label>
        <select id="reminder-channel" name="channel">
          <option value="whatsapp">WhatsApp</option>
          <option value="copy">Copier le message</option>
          <option value="email">Email</option>
          <option value="browser">Notification navigateur</option>
        </select>
      </div>
      <div class="field">
        <label for="reminder-notes">Note</label>
        <textarea id="reminder-notes" name="notes" placeholder="A sortir le soir"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit"><svg class="icon"><use href="#icon-plus"></use></svg>Ajouter</button>
      </div>
    </form>
  `;
}

function renderReminderTimeBoard(reminders) {
  return `
    <details class="time-board">
      <summary>
        <span><svg class="icon"><use href="#icon-clock"></use></svg>Horaires des rappels</span>
        <strong>${reminders.length}</strong>
      </summary>
      <div class="time-table">
        ${
          reminders.length
            ? reminders.map(renderReminderTimeRow).join("")
            : `<div class="empty-state">Aucun rappel a modifier</div>`
        }
      </div>
    </details>
  `;
}

function renderReminderTimeRow(item) {
  const owner = getUserById(item.ownerId) || getCurrentUser();
  return `
    <div class="time-row reminder-time-row">
      <div class="time-row-title">
        <span class="color-dot" style="background:${owner.color}"></span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.days.map(dayLabel).join(", ")} · ${escapeHtml(owner.name)}</small>
        </div>
      </div>
      <label>
        Heure
        <select data-action="update-reminder-time" data-id="${item.id}">
          ${renderTimeOptions(item.time)}
        </select>
      </label>
    </div>
  `;
}

function renderGroceriesView() {
  const family = getCurrentFamily();
  const items = [...family.groceries].sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt));
  return `
    <div class="view-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Liste de courses</h2>
          <button class="btn ghost" type="button" data-action="clear-bought"><svg class="icon"><use href="#icon-check"></use></svg>Nettoyer</button>
        </div>
        <div class="panel-body stack">
          ${items.length ? items.map(renderGroceryRow).join("") : `<div class="empty-state">Liste vide</div>`}
        </div>
      </section>
      <aside class="panel">
        <div class="panel-header">
          <h2>Ajouter</h2>
        </div>
        <div class="panel-body">
          ${renderGroceryForm()}
        </div>
      </aside>
    </div>
  `;
}

function renderGroceryRow(item) {
  const addedBy = getUserById(item.addedBy);
  const checkedBy = getUserById(item.checkedBy);
  const meta = [
    item.quantity,
    item.category,
    addedBy ? `par ${addedBy.name}` : "",
    checkedBy ? `pris par ${checkedBy.name}` : "",
  ].filter(Boolean);

  return `
    <article class="grocery-row ${item.checked ? "checked" : ""}">
      <input type="checkbox" aria-label="Article pris" ${item.checked ? "checked" : ""} data-action="toggle-grocery" data-id="${item.id}" />
      <div class="row-title">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${meta.map(escapeHtml).join(" · ")}</small>
      </div>
      <div class="row-actions">
        ${item.category ? `<span class="category-pill">${escapeHtml(item.category)}</span>` : ""}
        <button class="btn ghost icon-only" type="button" title="Supprimer" data-action="delete-grocery" data-id="${item.id}"><svg class="icon"><use href="#icon-trash"></use></svg></button>
      </div>
    </article>
  `;
}

function renderGroceryForm() {
  return `
    <form data-submit="grocery" class="field-grid">
      <div class="field">
        <label for="grocery-title">Article</label>
        <input id="grocery-title" name="title" type="text" required placeholder="Lait, pommes, lessive..." />
      </div>
      <div class="field-grid two">
        <div class="field">
          <label for="grocery-quantity">Quantite</label>
          <input id="grocery-quantity" name="quantity" type="text" placeholder="2, 1 kg..." />
        </div>
        <div class="field">
          <label for="grocery-category">Rayon</label>
          <select id="grocery-category" name="category">
            <option value="Frais">Frais</option>
            <option value="Epicerie">Epicerie</option>
            <option value="Maison">Maison</option>
            <option value="Bebe">Bebe</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit"><svg class="icon"><use href="#icon-plus"></use></svg>Ajouter</button>
      </div>
    </form>
  `;
}

function renderAccountView() {
  const user = getCurrentUser();
  const family = getCurrentFamily();
  const inviteLink = getInviteLink();
  return `
    <div class="account-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Profil</h2>
        </div>
        <div class="panel-body">
          <form data-submit="profile" class="field-grid">
            <div class="profile-photo-row">
              ${renderAvatar(user, "avatar profile-avatar")}
              <div class="field">
                <label for="profile-photo">Photo de profil</label>
                <input id="profile-photo" name="photo" type="file" accept="image/*" />
                <label class="check-row">
                  <input type="checkbox" name="removePhoto" value="yes" />
                  Retirer la photo
                </label>
              </div>
            </div>
            <div class="field-grid two">
              <div class="field">
                <label for="profile-name">Prenom</label>
                <input id="profile-name" name="name" type="text" value="${escapeAttribute(user.name)}" required />
              </div>
              <div class="field">
                <label for="profile-email">Email</label>
                <input id="profile-email" type="email" value="${escapeAttribute(user.email)}" disabled />
              </div>
            </div>
            <div class="field">
              <span class="field-title">Couleur</span>
              <div class="swatches">${renderSwatches("profile-color", user.color)}</div>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit"><svg class="icon"><use href="#icon-check"></use></svg>Enregistrer</button>
              <button class="btn ghost" type="button" data-action="request-notifications"><svg class="icon"><use href="#icon-bell"></use></svg>Notifications</button>
              <button class="btn ghost" type="button" data-action="install-app"><svg class="icon"><use href="#icon-home"></use></svg>Installer</button>
            </div>
          </form>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Application mobile</h2>
        </div>
        <div class="panel-body">
          <div class="app-install-card">
            <div class="app-icon-preview">FA</div>
            <div>
              <strong>Family agent installable</strong>
              <p class="hint">Le meme lien reste actif, et le telephone peut ajouter l'app sur l'ecran d'accueil.</p>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn primary" type="button" data-action="install-app"><svg class="icon"><use href="#icon-home"></use></svg>Installer l'app</button>
            <button class="btn ghost" type="button" data-action="request-notifications"><svg class="icon"><use href="#icon-bell"></use></svg>Activer les notifs</button>
          </div>
          <p class="hint">Les rappels navigateur peuvent s'afficher si l'app est autorisee et ouverte. Pour des notifications push garanties meme app fermee, il faudra ajouter un backend.</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Famille</h2>
          <button class="btn ghost" type="button" data-action="copy-export"><svg class="icon"><use href="#icon-copy"></use></svg>Exporter</button>
        </div>
        <div class="panel-body">
          <table class="member-table">
            <thead><tr><th>Membre</th><th>Email</th><th>Couleur</th></tr></thead>
            <tbody>
              ${getFamilyUsers(family).map((member) => `
                <tr>
                  <td>${escapeHtml(member.name)}</td>
                  <td>${escapeHtml(member.email)}</td>
                  <td><span class="color-dot" style="background:${member.color}"></span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <p class="hint">Code : ${escapeHtml(family.code)}</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Lien groupe</h2>
        </div>
        <div class="panel-body">
          <div class="invite-box">
            <div class="field">
              <label for="invite-link">Invitation</label>
              <input id="invite-link" type="text" value="${escapeAttribute(inviteLink)}" readonly />
            </div>
            <div class="form-actions">
              <button class="btn primary" type="button" data-action="copy-invite"><svg class="icon"><use href="#icon-copy"></use></svg>Copier</button>
              <button class="btn ghost" type="button" data-action="share-invite"><svg class="icon"><use href="#icon-send"></use></svg>WhatsApp</button>
            </div>
            <p class="hint">Le lien ajoute une personne au groupe famille avec les memes espaces : planning, rappels et courses.</p>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Activite</h2>
        </div>
        <div class="panel-body stack">
          ${(family.activity || []).slice(0, 8).map((item) => `
            <div class="activity-row">
              <div class="row-title">
                <strong>${escapeHtml(item.text)}</strong>
                <small>${formatLongDate(new Date(item.at))}</small>
              </div>
            </div>
          `).join("") || `<div class="empty-state">Aucune activite</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderSwatches(name, selected) {
  return COLORS.map((color) => `
    <label class="swatch-input" title="${color}">
      <input type="radio" name="color" value="${color}" ${color === selected ? "checked" : ""} />
      <span style="background:${color}"></span>
    </label>
  `).join("");
}

function renderUserOptions() {
  return getFamilyUsers(getCurrentFamily()).map((user) => `
    <option value="${user.id}" ${user.id === getCurrentUser().id ? "selected" : ""}>${escapeHtml(user.name)}</option>
  `).join("");
}

function renderTimeOptions(selected, allowEmpty = false) {
  const options = [];
  if (allowEmpty) options.push(`<option value="" ${selected ? "" : "selected"}>Libre</option>`);

  for (let hour = 5; hour <= 23; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      options.push(`<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`);
    }
  }

  return options.join("");
}

async function handleLogin(data) {
  const email = normalizeEmail(data.email);
  const passwordHash = await hashPassword(data.password);
  const legacyHash = fallbackHash(data.password);
  const user = state.users.find((entry) => entry.email === email && (entry.passwordHash === passwordHash || entry.passwordHash === legacyHash));
  if (!user) throw new Error("Identifiants incorrects.");
  session = { userId: user.id };
  saveSession();
  ui = { ...initialUi };
  render();
}

async function handleSignup(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const email = normalizeEmail(data.email);
  if (state.users.some((user) => user.email === email)) throw new Error("Cet email existe deja.");

  const familyCode = String(data.familyCode || "").trim().toUpperCase();
  let family = Object.values(state.families).find((entry) => entry.code === familyCode);

  if (!family) {
    const familyId = createId("family");
    family = {
      id: familyId,
      name: String(data.familyName || (familyCode ? "Famille invitee" : "Ma famille")).trim() || "Ma famille",
      code: familyCode || createFamilyCode(),
      appointments: [],
      reminders: [],
      groceries: [],
      activity: [],
      createdAt: new Date().toISOString(),
    };
    state.families[familyId] = family;
  }

  const user = {
    id: createId("user"),
    familyId: family.id,
    name: String(data.name || "").trim(),
    email,
    color: data.color || COLORS[0],
    passwordHash: await hashPassword(data.password),
    createdAt: new Date().toISOString(),
  };

  state.users.push(user);
  addActivity(family, `${user.name} a rejoint la famille`);
  session = { userId: user.id };
  saveAll();
  ui = { ...initialUi };
  render();
}

function handleAppointment(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.title || !data.date || !data.time) throw new Error("Rendez-vous incomplet.");

  mutateFamily((family) => {
    family.appointments.push({
      id: createId("appointment"),
      title: String(data.title).trim(),
      date: data.date,
      time: data.time,
      endTime: data.endTime || "",
      ownerId: data.ownerId || getCurrentUser().id,
      location: String(data.location || "").trim(),
      channel: data.channel || "whatsapp",
      notes: String(data.notes || "").trim(),
      createdBy: getCurrentUser().id,
      createdAt: new Date().toISOString(),
    });
    addActivity(family, `Rendez-vous ajoute : ${data.title}`);
  });
  form.reset();
  showToast("Rendez-vous ajoute.");
}

function handleReminder(form) {
  const formData = new FormData(form);
  const days = formData.getAll("days").map(Number);
  if (!days.length) throw new Error("Choisissez au moins un jour.");

  mutateFamily((family) => {
    family.reminders.push({
      id: createId("reminder"),
      title: String(formData.get("title") || "").trim(),
      days,
      time: formData.get("time") || "20:00",
      ownerId: formData.get("ownerId") || getCurrentUser().id,
      channel: formData.get("channel") || "whatsapp",
      notes: String(formData.get("notes") || "").trim(),
      lastDoneAt: "",
      createdBy: getCurrentUser().id,
      createdAt: new Date().toISOString(),
    });
    addActivity(family, `Rappel ajoute : ${formData.get("title")}`);
  });
  form.reset();
  showToast("Rappel ajoute.");
}

function handleGrocery(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  mutateFamily((family) => {
    family.groceries.push({
      id: createId("grocery"),
      title: String(data.title || "").trim(),
      quantity: String(data.quantity || "").trim(),
      category: data.category || "Autre",
      addedBy: getCurrentUser().id,
      checked: false,
      checkedBy: "",
      checkedAt: "",
      createdAt: new Date().toISOString(),
    });
    addActivity(family, `Course ajoutee : ${data.title}`);
  });
  form.reset();
  showToast("Article ajoute.");
}

async function handleProfile(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const user = getCurrentUser();
  const photoFile = form.elements.photo?.files?.[0];
  user.name = String(data.name || user.name).trim();
  user.color = data.color || user.color;

  if (data.removePhoto === "yes") {
    user.photo = "";
  } else if (photoFile && photoFile.size > 0) {
    if (!photoFile.type.startsWith("image/")) throw new Error("Choisissez une image.");
    if (photoFile.size > 2 * 1024 * 1024) throw new Error("Photo trop lourde, maximum 2 Mo.");
    user.photo = await fileToDataUrl(photoFile);
  }

  saveAll();
  render();
  showToast("Profil enregistre.");
}

function mutateFamily(callback) {
  const family = getCurrentFamily();
  callback(family);
  saveAll();
  renderView();
}

function sendAppointment(id) {
  const family = getCurrentFamily();
  const item = family.appointments.find((entry) => entry.id === id);
  if (!item) return;
  const owner = getUserById(item.ownerId);
  const message = [
    `Rappel Family agent : ${item.title}`,
    `${formatShortDate(new Date(`${item.date}T00:00:00`))} a ${item.time}`,
    owner ? `Pour : ${owner.name}` : "",
    item.location ? `Lieu : ${item.location}` : "",
    item.notes || "",
  ].filter(Boolean).join("\n");
  dispatchMessage(item.channel, message, item.title);
}

function sendReminder(id) {
  const family = getCurrentFamily();
  const item = family.reminders.find((entry) => entry.id === id);
  if (!item) return;
  const owner = getUserById(item.ownerId);
  const message = [
    `Rappel Family agent : ${item.title}`,
    `Prochain passage : ${formatReminderDate(nextReminderDate(item))}`,
    owner ? `Responsable : ${owner.name}` : "",
    item.notes || "",
  ].filter(Boolean).join("\n");
  dispatchMessage(item.channel, message, item.title);
}

async function dispatchMessage(channel, message, subject) {
  if (channel === "whatsapp") {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    showToast("Message WhatsApp prepare.");
    return;
  }
  if (channel === "email") {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    return;
  }
  if (channel === "browser") {
    await requestNotifications();
    if ("Notification" in window && Notification.permission === "granted") {
      await showDeviceNotification(subject, message);
      showToast("Notification envoyee.");
    }
    return;
  }
  await copyText(message);
  showToast("Message copie.");
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("Notifications indisponibles dans ce navigateur.");
    return;
  }
  await registerServiceWorker();
  if (Notification.permission === "granted") {
    showToast("Notifications deja actives.");
    return;
  }
  const result = await Notification.requestPermission();
  showToast(result === "granted" ? "Notifications activees." : "Notifications refusees.");
}

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  showToast("Sur mobile : menu du navigateur, puis Ajouter a l'ecran d'accueil.");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("sw.js");
  } catch {
    return null;
  }
}

async function showDeviceNotification(title, body) {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        badge: "icons/icon-192.png",
        icon: "icons/icon-192.png",
        tag: `family-agent-${Date.now()}`,
      });
      return;
    }
  }
  new Notification(title, { body, icon: "icons/icon-192.png" });
}

function startDueWatcher() {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = setInterval(checkDueAlerts, 60000);
  checkDueAlerts();
}

function checkDueAlerts() {
  if (!session || !("Notification" in window) || Notification.permission !== "granted") return;
  const family = getCurrentFamily();
  if (!family) return;

  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  const alerted = family.alerted || {};
  let changed = false;

  for (const appointment of family.appointments) {
    if (appointment.channel !== "browser") continue;
    const startsAt = new Date(`${appointment.date}T${appointment.time || "00:00"}`);
    const alertKey = `appointment:${appointment.id}:${toDateInput(startsAt)}`;
    if (startsAt >= now && startsAt <= soon && !alerted[alertKey]) {
      showDeviceNotification(appointment.title, `A ${appointment.time}`);
      alerted[alertKey] = true;
      changed = true;
    }
  }

  for (const reminder of family.reminders) {
    if (reminder.channel !== "browser") continue;
    const next = nextReminderDate(reminder);
    const alertKey = `reminder:${reminder.id}:${toDateInput(next)}`;
    if (next >= now && next <= soon && !alerted[alertKey]) {
      showDeviceNotification(reminder.title, `A ${reminder.time}`);
      alerted[alertKey] = true;
      changed = true;
    }
  }

  if (changed) {
    family.alerted = alerted;
    saveState();
  }
}

function seedDemo(force = false) {
  if (!force && state.users.length) return;

  const passwordHash = fallbackHash("demo");
  state = {
    users: [
      { id: "user-camille", familyId: "family-demo", name: "Camille", email: "camille@demo.fr", color: COLORS[0], passwordHash, createdAt: new Date().toISOString() },
      { id: "user-noa", familyId: "family-demo", name: "Noa", email: "noa@demo.fr", color: COLORS[1], passwordHash, createdAt: new Date().toISOString() },
      { id: "user-lina", familyId: "family-demo", name: "Lina", email: "lina@demo.fr", color: COLORS[2], passwordHash, createdAt: new Date().toISOString() },
      { id: "user-sam", familyId: "family-demo", name: "Sam", email: "sam@demo.fr", color: COLORS[3], passwordHash, createdAt: new Date().toISOString() },
    ],
    families: {
      "family-demo": {
        id: "family-demo",
        name: "Famille Martin",
        code: "FAMILY-AGENT",
        appointments: demoAppointments(),
        reminders: [
          { id: "reminder-yellow", title: "Sortir poubelle jaune", days: [3], time: "20:00", ownerId: "user-camille", channel: "whatsapp", notes: "A sortir mercredi soir", lastDoneAt: "", createdBy: "user-camille", createdAt: new Date().toISOString() },
          { id: "reminder-grey", title: "Sortir poubelle grise", days: [1], time: "20:00", ownerId: "user-noa", channel: "whatsapp", notes: "A sortir lundi soir", lastDoneAt: "", createdBy: "user-camille", createdAt: new Date().toISOString() },
          { id: "reminder-library", title: "Retour bibliotheque", days: [6], time: "10:00", ownerId: "user-lina", channel: "copy", notes: "Sacs dans l'entree", lastDoneAt: "", createdBy: "user-lina", createdAt: new Date().toISOString() },
        ],
        groceries: [
          { id: "grocery-1", title: "Lait", quantity: "2", category: "Frais", addedBy: "user-camille", checked: false, checkedBy: "", checkedAt: "", createdAt: new Date().toISOString() },
          { id: "grocery-2", title: "Pommes", quantity: "1 kg", category: "Frais", addedBy: "user-noa", checked: false, checkedBy: "", checkedAt: "", createdAt: new Date().toISOString() },
          { id: "grocery-3", title: "Lessive", quantity: "", category: "Maison", addedBy: "user-sam", checked: true, checkedBy: "user-camille", checkedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
        ],
        activity: [
          { text: "Liste de courses mise a jour", at: new Date().toISOString() },
          { text: "Rappel poubelle jaune cree", at: new Date().toISOString() },
        ],
        alerted: {},
        createdAt: new Date().toISOString(),
      },
    },
    counters: {},
  };
  saveAll();
}

function demoAppointments() {
  const today = new Date();
  const weekStart = getWeekStart(today);
  return [
    { id: "appointment-1", title: "Dentiste Lina", date: toDateInput(addDays(weekStart, 1)), time: "17:30", endTime: "18:15", ownerId: "user-lina", location: "Cabinet rue Victor Hugo", channel: "whatsapp", notes: "Carte vitale", createdBy: "user-camille", createdAt: new Date().toISOString() },
    { id: "appointment-2", title: "Entrainement foot", date: toDateInput(addDays(weekStart, 2)), time: "18:00", endTime: "19:30", ownerId: "user-noa", location: "Stade municipal", channel: "whatsapp", notes: "", createdBy: "user-noa", createdAt: new Date().toISOString() },
    { id: "appointment-3", title: "Visio maitresse", date: toDateInput(addDays(weekStart, 4)), time: "12:30", endTime: "13:00", ownerId: "user-camille", location: "Meet", channel: "email", notes: "Bulletin a relire", createdBy: "user-camille", createdAt: new Date().toISOString() },
    { id: "appointment-4", title: "Drive courses", date: toDateInput(addDays(weekStart, 5)), time: "10:15", endTime: "", ownerId: "user-sam", location: "Parking retrait", channel: "copy", notes: "", createdBy: "user-sam", createdAt: new Date().toISOString() },
  ];
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { users: [], families: {}, counters: {} };
  } catch {
    return { users: [], families: {}, counters: {} };
  }
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveAll() {
  saveState();
  saveSession();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveSession() {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function hashPassword(value) {
  if (window.crypto?.subtle) {
    const data = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(value);
}

function fallbackHash(value) {
  let hash = 5381;
  for (const char of String(value)) hash = (hash * 33) ^ char.charCodeAt(0);
  return `fallback-${hash >>> 0}`;
}

function getCurrentUser() {
  return state.users.find((user) => user.id === session?.userId);
}

function getCurrentFamily() {
  const user = getCurrentUser();
  return user ? state.families[user.familyId] : null;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Photo impossible a lire.")));
    reader.readAsDataURL(file);
  });
}

function getInviteCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get("join") || url.searchParams.get("family") || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

function getInviteLink() {
  const family = getCurrentFamily();
  if (!family) return "";
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("join", family.code);
    url.hash = "";
    return url.toString();
  } catch {
    return `${window.location.href.split("?")[0]}?join=${encodeURIComponent(family.code)}`;
  }
}

function getInviteMessage() {
  const family = getCurrentFamily();
  return [
    `Invitation Family agent - ${family.name}`,
    "Cree ton compte avec ce lien pour rejoindre le groupe famille :",
    getInviteLink(),
  ].join("\n");
}

function getFamilyUsers(family) {
  return state.users.filter((user) => user.familyId === family.id);
}

function getUserById(id) {
  return state.users.find((user) => user.id === id);
}

function addActivity(family, text) {
  family.activity = [{ text, at: new Date().toISOString() }, ...(family.activity || [])].slice(0, 30);
}

function createId(prefix) {
  state.counters = state.counters || {};
  state.counters[prefix] = (state.counters[prefix] || 0) + 1;
  return `${prefix}-${Date.now().toString(36)}-${state.counters[prefix]}`;
}

function createFamilyCode() {
  const raw = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FA-${raw}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function byDateTime(a, b) {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextReminderDate(reminder) {
  const now = new Date();
  for (let index = 0; index < 14; index += 1) {
    const candidate = addDays(now, index);
    if (!reminder.days.includes(candidate.getDay())) continue;
    const [hours, minutes] = reminder.time.split(":").map(Number);
    candidate.setHours(hours || 0, minutes || 0, 0, 0);
    if (candidate >= now) return candidate;
  }
  return addDays(now, 14);
}

function remindersForDate(date) {
  const family = getCurrentFamily();
  if (!family) return [];
  return family.reminders.filter((reminder) => reminder.days.includes(date.getDay()));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function formatReminderDate(date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayName(date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(date);
}

function dayLabel(value) {
  return DAYS.find((day) => day.value === Number(value))?.short || "";
}

function relativeDay(date) {
  const today = toDateInput(new Date());
  const target = toDateInput(date);
  if (today === target) return "aujourd'hui";
  return formatShortDate(date);
}

function channelLabel(channel) {
  return {
    whatsapp: "WhatsApp",
    copy: "Copie",
    email: "Email",
    browser: "Navigateur",
  }[channel] || channel;
}

function titleForView() {
  return {
    wall: "Mur familial",
    schedule: "Planning familial",
    reminders: "Rappels",
    groceries: "Courses partagees",
    account: "Compte",
  }[ui.view];
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // File URLs can block the Clipboard API, so keep a DOM fallback.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}
