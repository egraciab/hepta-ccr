const API_BASE = 'http://localhost:3000/api';

let token = localStorage.getItem('token') || '';
let currentUser = null;
let charts = {};
let loadingCount = 0;
let cdrState = { page: 1, limit: 15, sortBy: 'call_date', sortOrder: 'desc' };

const el = (id) => document.getElementById(id);
const spinner = el('spinner');
const toast = new bootstrap.Toast(el('toast'));
const confirmModal = new bootstrap.Modal(el('confirmModal'));

const setLoading = (on) => {
  loadingCount += on ? 1 : -1;
  if (loadingCount < 0) loadingCount = 0;
  spinner.classList.toggle('d-none', loadingCount === 0);
};

const notify = (msg, isError = false) => {
  el('toastBody').textContent = msg;
  el('toast').classList.toggle('text-bg-danger', isError);
  el('toast').classList.toggle('text-bg-primary', !isError);
  toast.show();
};

const confirmAction = (message) =>
  new Promise((resolve) => {
    el('confirmMessage').textContent = message;
    const btn = el('confirmAcceptBtn');
    const onAccept = () => {
      btn.removeEventListener('click', onAccept);
      confirmModal.hide();
      resolve(true);
    };
    btn.addEventListener('click', onAccept);
    el('confirmModal').addEventListener(
      'hidden.bs.modal',
      () => {
        btn.removeEventListener('click', onAccept);
        resolve(false);
      },
      { once: true }
    );
    confirmModal.show();
  });

const api = async (path, options = {}) => {
  setLoading(true);
  try {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Error API ${response.status}`);
    }

    return response;
  } finally {
    setLoading(false);
  }
};

const applyTheme = (theme) => {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', safeTheme);
  document.documentElement.setAttribute('data-bs-theme', safeTheme);
  localStorage.setItem('theme', safeTheme);
  el('darkModeBtn').innerHTML = safeTheme === 'dark' ? '<i class="bi bi-sun"></i> Modo claro' : '<i class="bi bi-moon-stars"></i> Modo oscuro';
};

const getChartColors = () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: dark ? '#e5e7eb' : '#334155',
    grid: dark ? 'rgba(203,213,225,0.15)' : 'rgba(100,116,139,0.2)',
  };
};

const drawChart = (id, type, labels, data, color = '#2563eb') => {
  if (charts[id]) charts[id].destroy();
  const palette = getChartColors();
  charts[id] = new Chart(el(id), {
    type,
    data: { labels, datasets: [{ data, backgroundColor: color, borderColor: color, fill: type === 'line', tension: 0.2 }] },
    options: {
      plugins: { legend: { labels: { color: palette.text } } },
      scales: type === 'pie' ? {} : {
        x: { ticks: { color: palette.text }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.text }, grid: { color: palette.grid } },
      },
    },
  });
};

const queryFromDateRange = () => {
  const params = new URLSearchParams();
  if (el('startDate').value) params.append('startDate', `${el('startDate').value}T00:00:00.000Z`);
  if (el('endDate').value) params.append('endDate', `${el('endDate').value}T23:59:59.999Z`);
  return params;
};

const login = async () => {
  try {
    const response = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: el('email').value, password: el('password').value }),
    });
    const payload = await response.json();
    token = payload.data.token;
    currentUser = payload.data.user;
    localStorage.setItem('token', token);
    el('loginView').classList.add('d-none');
    el('appView').classList.remove('d-none');
    notify('Sesión iniciada');
    await bootstrapData();
  } catch (error) {
    notify(error.message, true);
  }
};

const logout = () => {
  localStorage.removeItem('token');
  token = '';
  currentUser = null;
  location.reload();
};

const loadDashboard = async () => {
  const response = await api(`/stats?${queryFromDateRange().toString()}`);
  const stats = (await response.json()).data;

  el('totalCalls').textContent = stats.totalCalls;
  el('avgDuration').textContent = stats.averageDuration;
  el('answeredMissed').textContent = `${stats.answeredCalls} / ${stats.missedCalls}`;
  el('topAgent').textContent = stats.topAgent;

  drawChart('callsPerDayChart', 'line', stats.callsPerDay.map((x) => x.day), stats.callsPerDay.map((x) => x.total), '#3b82f6');
  drawChart('callsPerAgentChart', 'bar', stats.callsPerAgent.map((x) => x.agent), stats.callsPerAgent.map((x) => x.total), '#10b981');
  drawChart('statusChart', 'pie', stats.statusDistribution.map((x) => x.status), stats.statusDistribution.map((x) => x.total), ['#3b82f6', '#f59e0b', '#ef4444']);
  drawChart('hourChart', 'bar', stats.callsByHour.map((x) => `${x.hour}:00`), stats.callsByHour.map((x) => x.total), '#8b5cf6');
};

const cdrQuery = () => {
  const params = new URLSearchParams();
  if (el('cdrStart').value) params.append('startDate', `${el('cdrStart').value}T00:00:00.000Z`);
  if (el('cdrEnd').value) params.append('endDate', `${el('cdrEnd').value}T23:59:59.999Z`);
  if (el('cdrAgent').value) params.append('agent', el('cdrAgent').value);
  if (el('cdrStatus').value) params.append('status', el('cdrStatus').value);
  if (el('cdrSearch').value) params.append('search', el('cdrSearch').value);
  Object.entries(cdrState).forEach(([k, v]) => params.append(k, v));
  return params;
};

const loadCdr = async () => {
  const response = await api(`/cdr?${cdrQuery().toString()}`);
  const payload = (await response.json()).data;
  const tbody = el('cdrTable').querySelector('tbody');

  tbody.innerHTML = payload.items.map((row) => `<tr><td>${new Date(row.call_date).toLocaleString('es-ES')}</td><td>${row.source}</td><td>${row.destination}</td><td>${row.duration}</td><td>${row.status}</td><td>${row.agent}</td></tr>`).join('');
  el('cdrPageInfo').textContent = `Página ${payload.page} / ${Math.max(1, Math.ceil(payload.total / payload.limit))}`;
};

const loadAgents = async () => {
  const response = await api('/agents');
  const agents = (await response.json()).data;
  el('agentsTable').innerHTML = agents.map((a) => `<tr><td>${a.name}</td><td>${a.extension}</td><td><button data-id="${a.id}" class="btn btn-sm btn-outline-danger delete-agent">Eliminar</button></td></tr>`).join('');
};

const loadUsers = async () => {
  try {
    const response = await api('/users');
    const users = (await response.json()).data;
    el('usersTable').innerHTML = users.map((u) => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${new Date(u.created_at).toLocaleString('es-ES')}</td><td><button data-id="${u.id}" class="btn btn-sm btn-outline-danger delete-user">Eliminar</button></td></tr>`).join('');
  } catch (_error) {
    el('usersSection').innerHTML = '<div class="alert alert-warning">El módulo de usuarios requiere rol administrador.</div>';
  }
};

const loadSettings = async () => {
  try {
    const response = await api('/settings');
    const entries = (await response.json()).data;
    const map = Object.fromEntries(entries.map((x) => [x.key, x.value]));
    el('ucmIp').value = map.ucm_ip || '';
    el('apiUsername').value = map.api_username || '';
    el('apiPassword').value = map.api_password || '';
  } catch (_error) {
    el('settingsSection').innerHTML = '<div class="alert alert-warning">La configuración requiere rol administrador.</div>';
  }
};

const bootstrapData = async () => {
  await Promise.all([loadDashboard(), loadAgents(), loadUsers(), loadSettings(), loadCdr()]);
};

const initEvents = () => {
  el('loginBtn').addEventListener('click', login);
  el('logoutBtn').addEventListener('click', logout);

  el('refreshDashboard').addEventListener('click', loadDashboard);
  el('generateMock').addEventListener('click', async () => {
    await api('/cdr/mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 100 }) });
    notify('Datos de llamadas generados');
    await Promise.all([loadDashboard(), loadCdr()]);
  });

  el('resetDataBtn').addEventListener('click', async () => {
    const ok = await confirmAction('¿Estás seguro de que deseas resetear los datos? Esta acción no se puede deshacer.');
    if (!ok) return;
    await api('/cdr/reset', { method: 'POST' });
    notify('Datos reseteados correctamente');
    await Promise.all([loadDashboard(), loadCdr()]);
  });

  el('toggleSidebar').addEventListener('click', () => el('sidebar').classList.toggle('collapsed'));
  el('darkModeBtn').addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
    await loadDashboard();
  });

  document.querySelectorAll('.menu-item').forEach((item) => item.addEventListener('click', () => {
    document.querySelectorAll('.menu-item').forEach((x) => x.classList.remove('active'));
    item.classList.add('active');
    const target = item.dataset.section;
    document.querySelectorAll('.app-section').forEach((section) => section.classList.add('d-none'));
    el(`${target}Section`).classList.remove('d-none');
  }));

  el('cdrFilterBtn').addEventListener('click', () => {
    cdrState.page = 1;
    loadCdr();
  });
  el('prevPage').addEventListener('click', () => {
    cdrState.page = Math.max(1, cdrState.page - 1);
    loadCdr();
  });
  el('nextPage').addEventListener('click', () => {
    cdrState.page += 1;
    loadCdr();
  });

  document.querySelectorAll('#cdrTable th[data-sort]').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const sortBy = th.dataset.sort;
      cdrState.sortOrder = cdrState.sortBy === sortBy && cdrState.sortOrder === 'asc' ? 'desc' : 'asc';
      cdrState.sortBy = sortBy;
      loadCdr();
    });
  });

  el('addAgentBtn').addEventListener('click', async () => {
    const name = prompt('Nombre del agente');
    const extension = prompt('Extensión');
    if (!name || !extension) return;
    await api('/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, extension }) });
    await loadAgents();
    notify('Agente creado');
  });

  document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('delete-agent')) {
      const ok = await confirmAction('¿Estás seguro de que deseas eliminar este agente? Esta acción no se puede deshacer.');
      if (!ok) return;
      await api(`/agents/${event.target.dataset.id}`, { method: 'DELETE' });
      await loadAgents();
      notify('Agente eliminado');
    }

    if (event.target.classList.contains('delete-user')) {
      const ok = await confirmAction('¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.');
      if (!ok) return;
      try {
        await api(`/users/${event.target.dataset.id}`, { method: 'DELETE' });
        await loadUsers();
        notify('Usuario eliminado');
      } catch (error) {
        notify(error.message, true);
      }
    }
  });

  el('addUserBtn').addEventListener('click', async () => {
    const name = prompt('Nombre');
    const email = prompt('Correo');
    const password = prompt('Contraseña');
    const role = prompt('Rol (admin/supervisor/viewer)', 'viewer');
    if (!name || !email || !password) return;
    await api('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, role }) });
    await loadUsers();
    notify('Usuario creado');
  });

  el('importBtn').addEventListener('click', async () => {
    const file = el('csvFile').files[0];
    if (!file) return;
    const ok = await confirmAction('¿Deseas importar este archivo CSV? Si contiene registros duplicados se añadirán nuevamente.');
    if (!ok) return;
    const formData = new FormData();
    formData.append('file', file);
    await api('/import/cdr', { method: 'POST', body: formData });
    notify('CSV importado');
    await Promise.all([loadDashboard(), loadCdr()]);
  });

  el('exportBtn').addEventListener('click', async () => {
    const response = await api('/export/cdr');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cdr_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  el('saveSettingsBtn').addEventListener('click', async () => {
    try {
      const payloads = [
        { key: 'ucm_ip', value: el('ucmIp').value.trim() },
        { key: 'api_username', value: el('apiUsername').value.trim() },
        { key: 'api_password', value: el('apiPassword').value.trim() },
      ];
      for (const payload of payloads) {
        await api('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      notify('Configuración guardada');
    } catch (error) {
      notify(error.message, true);
    }
  });

  el('testConnectionBtn').addEventListener('click', async () => {
    try {
      const response = await api('/settings/test-connection', { method: 'POST' });
      const data = (await response.json()).data;
      el('testConnectionResult').innerHTML = `<div class="alert alert-success py-2">${data.message}</div>`;
      notify('Conexión verificada');
    } catch (error) {
      el('testConnectionResult').innerHTML = `<div class="alert alert-danger py-2">${error.message}</div>`;
      notify('Error de conexión', true);
    }
  });
};

initEvents();
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((node) => new bootstrap.Tooltip(node));
applyTheme(localStorage.getItem('theme') || 'light');

if (token) {
  el('loginView').classList.add('d-none');
  el('appView').classList.remove('d-none');
  bootstrapData().catch(() => logout());
}
