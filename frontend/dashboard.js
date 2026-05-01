const API_BASE = 'http://10.10.20.232:3000/api';

let token = localStorage.getItem('token') || '';
let currentUser = null;
let licenseStatus = null;
let charts = {};
let loadingCount = 0;
let cdrState = { page: 1, limit: 15, sortBy: 'call_date', sortOrder: 'desc', hour: '' };
let agentsCache = [];
let autoSyncTimer = null;

const statusMap = { ANSWERED: 'contestada', 'NO ANSWER': 'perdida', FAILED: 'fallida', BUSY: 'ocupado' };

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

const confirmAction = (message) => new Promise((resolve) => {
  el('confirmMessage').textContent = message;
  const accept = el('confirmAcceptBtn');
  const onOk = () => {
    accept.removeEventListener('click', onOk);
    confirmModal.hide();
    resolve(true);
  };
  accept.addEventListener('click', onOk);
  el('confirmModal').addEventListener('hidden.bs.modal', () => {
    accept.removeEventListener('click', onOk);
    resolve(false);
  }, { once: true });
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
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', value);
  document.documentElement.setAttribute('data-bs-theme', value);
  localStorage.setItem('theme', value);
  el('darkModeBtn').innerHTML = value === 'dark' ? '<i class="bi bi-sun"></i> Modo claro' : '<i class="bi bi-moon-stars"></i> Modo oscuro';
};

const chartPalette = () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return { text: dark ? '#e5e7eb' : '#334155', grid: dark ? 'rgba(203,213,225,0.2)' : 'rgba(100,116,139,0.2)' };
};

const chartClickFilter = (type, value) => {
  if (type === 'day') {
    el('cdrStart').value = value;
    el('cdrEnd').value = value;
  }
  if (type === 'agent') el('agentFilter').value = value;
  if (type === 'status') el('cdrStatus').value = value;
  if (type === 'hour') cdrState.hour = String(value);
  cdrState.page = 1;
  openSection('cdr');
  loadCdr().catch((error) => notify(error.message, true));
};

const drawChart = (id, config) => {
  if (charts[id]) charts[id].destroy();
  const palette = chartPalette();
  charts[id] = new Chart(el(id), {
    type: config.type,
    data: {
      labels: config.labels,
      datasets: [{ label: 'Llamadas', data: config.values, backgroundColor: config.color, borderColor: config.color, fill: config.type === 'line', tension: 0.2 }],
    },
    options: {
      plugins: { legend: { labels: { color: palette.text } } },
      scales: config.type === 'pie' ? {} : {
        x: { ticks: { color: palette.text }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.text }, grid: { color: palette.grid } },
      },
      onClick: (_event, elements) => {
        if (!elements.length || !config.onClick) return;
        config.onClick(elements[0].index);
      },
    },
  });
};

const queryFromRange = (a = 'startDate', b = 'endDate') => {
  const params = new URLSearchParams();
  if (el(a).value) params.append('startDate', `${el(a).value}T00:00:00.000Z`);
  if (el(b).value) params.append('endDate', `${el(b).value}T23:59:59.999Z`);
  return params;
};

const loadLicenseStatus = async () => {
  const response = await api('/license/status');
  licenseStatus = (await response.json()).data;
  const banner = el('licenseBanner');
  if (licenseStatus.restricted) {
    banner.textContent = 'Sistema en modo restringido por licencia';
    banner.classList.remove('d-none');
  } else {
    banner.classList.add('d-none');
  }
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
    applyRoleVisibility();
    notify('Sesión iniciada');
    await bootstrapData();
  } catch (error) {
    notify(error.message, true);
  }
};

const logout = () => {
  localStorage.removeItem('token');
  token = '';
  location.reload();
};

const applyRoleVisibility = () => {
  const isAdmin = currentUser?.role === 'admin';
  document.querySelectorAll('[data-admin-only="true"]').forEach((node) => node.classList.toggle('d-none', !isAdmin));
};

const loadDashboard = async () => {
  const response = await api(`/stats?${queryFromRange().toString()}`);
  const stats = (await response.json()).data;
  el('totalCalls').textContent = stats.totalCalls;
  el('avgDuration').textContent = formatDuration(stats.averageDuration);
  el('answeredMissed').textContent = `${stats.answeredCalls} / ${stats.missedCalls}`;
  el('topAgent').textContent = stats.topAgent;

  drawChart('callsPerDayChart', { type: 'line', labels: stats.callsPerDay.map((x) => x.day), values: stats.callsPerDay.map((x) => x.total), color: '#3b82f6', onClick: (idx) => chartClickFilter('day', stats.callsPerDay[idx].day) });
  drawChart('callsPerAgentChart', { type: 'bar', labels: stats.callsPerAgent.map((x) => x.agent), values: stats.callsPerAgent.map((x) => x.total), color: '#10b981', onClick: (idx) => chartClickFilter('agent', stats.callsPerAgent[idx].agent) });
  drawChart('statusChart', { type: 'pie', labels: stats.statusDistribution.map((x) => statusMap[x.status] || x.status), values: stats.statusDistribution.map((x) => x.total), color: ['#3b82f6', '#f59e0b', '#ef4444'], onClick: (idx) => chartClickFilter('status', stats.statusDistribution[idx].status) });
  drawChart('hourChart', { type: 'bar', labels: stats.callsByHour.map((x) => `${x.hour}:00`), values: stats.callsByHour.map((x) => x.total), color: '#8b5cf6', onClick: (idx) => chartClickFilter('hour', Number(stats.callsByHour[idx].hour)) });
};

const cdrQuery = () => {
  const params = queryFromRange('cdrStart', 'cdrEnd');
  if (el('agentFilter').value) params.append('agent', el('agentFilter').value);
  if (el('cdrStatus').value) params.append('status', el('cdrStatus').value);
  if (el('cdrSearch').value) params.append('search', el('cdrSearch').value);
  if (cdrState.hour !== '') params.append('hour', cdrState.hour);
  params.append('page', cdrState.page);
  params.append('limit', cdrState.limit);
  params.append('sortBy', cdrState.sortBy);
  params.append('sortOrder', cdrState.sortOrder);
  return params;
};

const loadCdr = async () => {
  const response = await api(`/cdr?${cdrQuery().toString()}`);
  const payload = (await response.json()).data;
  el('cdrTable').querySelector('tbody').innerHTML = payload.items.map((row) => `<tr><td>${new Date(row.call_date).toLocaleString('es-ES')}</td><td>${row.source}</td><td>${row.destination}</td><td>${formatDuration((row.billsec > 0 ? row.billsec : row.duration))}</td><td>${statusMap[row.status] || row.status}</td><td>${row.agent || '-'}</td></tr>`).join('');
  el('cdrPageInfo').textContent = `Página ${payload.page} / ${Math.max(1, Math.ceil(payload.total / payload.limit))}`;
};

const loadAgents = async () => {
  const response = await api('/agents');
  const agents = (await response.json()).data;
  agentsCache = agents;
  el('agentsTable').innerHTML = agents.map((a) => `<tr><td>${a.name}</td><td>${a.role || ''}</td><td>${a.extension}</td><td><button data-id="${a.id}" class="btn btn-sm btn-outline-primary edit-agent">Editar</button> <button data-id="${a.id}" class="btn btn-sm btn-outline-danger delete-agent">Eliminar</button></td></tr>`).join('');

  const agentFilter = el('agentFilter');
  const current = agentFilter.value;
  agentFilter.innerHTML = '<option value="">Todos</option>';
  agents.forEach((agent) => {
    const option = document.createElement('option');
    option.value = agent.name;
    option.textContent = agent.name;
    agentFilter.appendChild(option);
  });
  agentFilter.value = current;
};

const loadUsers = async () => {
  if (currentUser?.role !== 'admin') return;
  const response = await api('/users');
  const users = (await response.json()).data;
  el('usersTable').innerHTML = users.map((u) => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${new Date(u.created_at).toLocaleString('es-ES')}</td><td><button data-id="${u.id}" class="btn btn-sm btn-outline-primary edit-user">Editar</button> <button data-id="${u.id}" class="btn btn-sm btn-outline-warning pass-user">Clave</button> <button data-id="${u.id}" class="btn btn-sm btn-outline-danger delete-user">Eliminar</button></td></tr>`).join('');
};

const loadSettings = async () => {
  if (currentUser?.role !== 'admin') return;
  const response = await api('/settings');
  const map = Object.fromEntries((await response.json()).data.map((x) => [x.key, x.value]));
  el('ucmBaseUrl').value = map.ucm_base_url || '';
  el('apiUsername').value = map.ucm_api_user || '';
  el('apiPassword').value = map.ucm_api_password || '';
};

const formatDuration = (sec) => {
  const s = Number(sec || 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const openSection = (name) => {
  document.querySelectorAll('.menu-item').forEach((x) => x.classList.toggle('active', x.dataset.section === name));
  document.querySelectorAll('.app-section').forEach((section) => section.classList.add('d-none'));
  el(`${name}Section`).classList.remove('d-none');
};

const bootstrapData = async () => {
  await loadLicenseStatus();
  await Promise.all([loadDashboard(), loadAgents(), loadUsers(), loadSettings(), loadCdr()]);
};

const applyCdrFilters = () => {
  cdrState.page = 1;
  loadCdr().catch((error) => notify(error.message, true));
};

const clearFilters = () => {
  el('cdrStart').value = '';
  el('cdrEnd').value = '';
  el('agentFilter').value = '';
  el('cdrStatus').value = '';
  el('cdrSearch').value = '';
  cdrState.hour = '';
  applyCdrFilters();
};

const downloadFrom = async (url, filename) => {
  const response = await api(url);
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const initEvents = () => {
  el('loginBtn').addEventListener('click', login);
  el('logoutBtn').addEventListener('click', logout);
  el('darkModeBtn').addEventListener('click', async () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    await loadDashboard();
  });
  el('toggleSidebar').addEventListener('click', () => el('sidebar').classList.toggle('collapsed'));

  document.querySelectorAll('.menu-item').forEach((item) => item.addEventListener('click', () => openSection(item.dataset.section)));

  el('refreshDashboard').addEventListener('click', loadDashboard);
  el('importCdrBtn').addEventListener('click', () => {
    notify('Importación en proceso');
    api('/ucm/import', { method: 'POST' }).then(() => pollImportStatus()).catch((error) => notify(error.message, true));
  });

  el('autoSyncToggle').addEventListener('change', (event) => {
    if (event.target.checked) {
      autoSyncTimer = setInterval(() => {
        api('/ucm/import', { method: 'POST' })
          .then(() => pollImportStatus())
          .catch((error) => notify(error.message, true));
      }, 30000);
      notify('Auto-sync habilitado');
    } else {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
      notify('Auto-sync deshabilitado');
    }
  });

  el('cdrFilterBtn').addEventListener('click', applyCdrFilters);
  el('clearFiltersBtn').addEventListener('click', clearFilters);
  ['cdrStart', 'cdrEnd', 'agentFilter', 'cdrStatus'].forEach((id) => el(id).addEventListener('change', applyCdrFilters));
  el('cdrSearch').addEventListener('input', () => {
    clearTimeout(window.__cdrSearchTimer);
    window.__cdrSearchTimer = setTimeout(applyCdrFilters, 300);
  });

  el('prevPage').addEventListener('click', () => { cdrState.page = Math.max(1, cdrState.page - 1); loadCdr().catch((e) => notify(e.message, true)); });
  el('nextPage').addEventListener('click', () => { cdrState.page += 1; loadCdr().catch((e) => notify(e.message, true)); });

  document.querySelectorAll('#cdrTable th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    cdrState.sortOrder = cdrState.sortBy === th.dataset.sort && cdrState.sortOrder === 'asc' ? 'desc' : 'asc';
    cdrState.sortBy = th.dataset.sort;
    loadCdr().catch((e) => notify(e.message, true));
  }));

  const agentModal = new bootstrap.Modal(el('agentModal'));

  el('addAgentBtn').addEventListener('click', () => {
    el('agentModalTitle').textContent = 'Crear agente';
    el('agentId').value = '';
    el('agentName').value = '';
    el('agentRole').value = '';
    el('agentExtension').value = '';
    agentModal.show();
  });

  el('saveAgentBtn').addEventListener('click', async () => {
    try {
      const id = el('agentId').value;
      const payload = { name: el('agentName').value, role: el('agentRole').value, extension: el('agentExtension').value };
      if (id) {
        await api(`/agents/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await api('/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      agentModal.hide();
      notify('Agente guardado');
      await loadAgents();
    } catch (error) {
      notify(error.message, true);
    }
  });

  document.addEventListener('click', async (event) => {
    try {
      if (event.target.classList.contains('edit-agent')) {
        const id = event.target.dataset.id;
        const row = event.target.closest('tr').children;
        el('agentModalTitle').textContent = 'Editar agente';
        el('agentId').value = id;
        el('agentName').value = row[0].textContent;
        el('agentRole').value = row[1].textContent;
        el('agentExtension').value = row[2].textContent;
        agentModal.show();
      }

      if (event.target.classList.contains('delete-agent')) {
        if (!(await confirmAction('¿Eliminar este agente?'))) return;
        await api(`/agents/${event.target.dataset.id}`, { method: 'DELETE' });
        notify('Agente eliminado');
        await loadAgents();
      }

      if (event.target.classList.contains('delete-user')) {
        if (!(await confirmAction('¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.'))) return;
        await api(`/users/${event.target.dataset.id}`, { method: 'DELETE' });
        notify('Usuario eliminado');
        await loadUsers();
      }

      if (event.target.classList.contains('edit-user')) {
        const id = event.target.dataset.id;
        const row = event.target.closest('tr').children;
        el('userModalTitle').textContent = 'Editar usuario';
        el('userId').value = id;
        el('userName').value = row[0].textContent;
        el('userEmail').value = row[1].textContent;
        el('userRole').value = row[2].textContent;
        el('userPassword').value = '';
        userModal.show();
      }

      if (event.target.classList.contains('pass-user')) {
        const id = event.target.dataset.id;
        el('userModalTitle').textContent = 'Cambiar contraseña';
        el('userId').value = id;
        el('userPassword').value = '';
        userModal.show();
      }
    } catch (error) {
      notify(error.message, true);
    }
  });

  const userModal = new bootstrap.Modal(el('userModal'));

  el('addUserBtn').addEventListener('click', () => {
    el('userModalTitle').textContent = 'Crear usuario';
    el('userId').value = '';
    el('userName').value = '';
    el('userEmail').value = '';
    el('userRole').value = 'viewer';
    el('userPassword').value = '';
    userModal.show();
  });

  el('toggleUserPassword').addEventListener('click', () => {
    const input = el('userPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  el('saveUserBtn').addEventListener('click', async () => {
    try {
      const id = el('userId').value;
      const payload = { name: el('userName').value, email: el('userEmail').value, role: el('userRole').value };
      if (!id) {
        await api('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, password: el('userPassword').value || 'changeme123' }) });
      } else {
        await api(`/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (el('userPassword').value) {
          await api(`/users/${id}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: el('userPassword').value }) });
        }
      }
      userModal.hide();
      notify('Usuario guardado');
      await loadUsers();
    } catch (error) {
      notify(error.message, true);
    }
  });

  el('importBtn').addEventListener('click', async () => {
    try {
      const file = el('csvFile').files[0];
      if (!file) return;
      if (!(await confirmAction('¿Importar archivo CSV?'))) return;
      const data = new FormData();
      data.append('file', file);
      await api('/import/cdr', { method: 'POST', body: data });
      notify('CSV importado');
      await Promise.all([loadDashboard(), loadCdr()]);
    } catch (error) {
      notify(error.message, true);
    }
  });

  el('exportCsvBtn').addEventListener('click', () => downloadFrom('/export/cdr', 'reporte_llamadas.csv').catch((e) => notify(e.message, true)));
  el('exportXlsxBtn').addEventListener('click', () => downloadFrom('/export/cdr/xlsx', 'reporte_llamadas.xlsx').catch((e) => notify(e.message, true)));
  el('exportPdfBtn').addEventListener('click', () => downloadFrom('/export/cdr/pdf', 'reporte_llamadas.pdf').catch((e) => notify(e.message, true)));

  el('saveSettingsBtn').addEventListener('click', async () => {
    const payloads = [
      { key: 'ucm_base_url', value: el('ucmBaseUrl').value.trim() },
      { key: 'ucm_api_user', value: el('apiUsername').value.trim() },
      { key: 'ucm_api_password', value: el('apiPassword').value.trim() },
    ];

    try {
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
      const response = await api('/ucm/test-connection', { method: 'POST' });
      const result = (await response.json()).data;
      el('testConnectionResult').innerHTML = `<div class="alert ${result.success ? 'alert-success' : 'alert-danger'} py-2">${result.message}</div>`;
      notify(result.success ? 'Conexión exitosa' : 'Error de conexión', !result.success);
    } catch (error) {
      el('testConnectionResult').innerHTML = `<div class="alert alert-danger py-2">${error.message}</div>`;
      notify('Error de conexión', true);
    }
  });
};

const pollImportStatus = async () => {
  const tick = async () => {
    const response = await api('/ucm/import/status');
    const data = (await response.json()).data;
    notify(`Importando CDR... recibidos ${data.received}, insertados ${data.inserted}, omitidos ${data.skipped}`);
    if (data.running) {
      setTimeout(tick, 2000);
      return;
    }
    if (data.error) notify(data.error, true);
    await Promise.all([loadDashboard(), loadCdr()]);
  };
  await tick();
};

initEvents();
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((n) => new bootstrap.Tooltip(n));
applyTheme(localStorage.getItem('theme') || 'light');

if (token) {
  el('loginView').classList.add('d-none');
  el('appView').classList.remove('d-none');
  bootstrapData().catch((error) => {
    notify(error.message, true);
    logout();
  });
}
