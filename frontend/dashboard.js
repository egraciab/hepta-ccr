const API_BASE = 'http://localhost:3000/api';

let token = localStorage.getItem('token') || '';
let charts = {};
let cdrState = { page: 1, limit: 15, sortBy: 'call_date', sortOrder: 'desc' };

const el = (id) => document.getElementById(id);
const spinner = el('spinner');
const toast = new bootstrap.Toast(el('toast'));

const showSpinner = (show) => spinner.classList.toggle('d-none', !show);
const notify = (msg) => {
  el('toastBody').textContent = msg;
  toast.show();
};

const api = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `API error ${response.status}`);
  }
  return response;
};

const queryFromDateRange = () => {
  const params = new URLSearchParams();
  if (el('startDate').value) params.append('startDate', `${el('startDate').value}T00:00:00.000Z`);
  if (el('endDate').value) params.append('endDate', `${el('endDate').value}T23:59:59.999Z`);
  return params;
};

const login = async () => {
  showSpinner(true);
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: el('email').value, password: el('password').value }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Login failed');

    token = payload.data.token;
    localStorage.setItem('token', token);
    el('loginView').classList.add('d-none');
    el('appView').classList.remove('d-none');
    notify('Logged in');
    await loadDashboard();
    await loadAgents();
    await loadUsers();
    await loadSettings();
    await loadCdr();
  } catch (error) {
    alert(error.message);
  } finally {
    showSpinner(false);
  }
};

const logout = () => {
  localStorage.removeItem('token');
  token = '';
  location.reload();
};

const drawChart = (id, type, labels, data, color = '#0d6efd') => {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el(id), {
    type,
    data: { labels, datasets: [{ data, label: id, backgroundColor: color, borderColor: color, fill: type === 'line' }] },
  });
};

const loadDashboard = async () => {
  const params = queryFromDateRange();
  const response = await api(`/stats?${params.toString()}`);
  const stats = (await response.json()).data;

  el('totalCalls').textContent = stats.totalCalls;
  el('avgDuration').textContent = stats.averageDuration;
  el('answeredMissed').textContent = `${stats.answeredCalls} / ${stats.missedCalls}`;
  el('topAgent').textContent = stats.topAgent;

  drawChart('callsPerDayChart', 'line', stats.callsPerDay.map((x) => x.day), stats.callsPerDay.map((x) => x.total));
  drawChart('callsPerAgentChart', 'bar', stats.callsPerAgent.map((x) => x.agent), stats.callsPerAgent.map((x) => x.total), '#198754');
  drawChart('statusChart', 'pie', stats.statusDistribution.map((x) => x.status), stats.statusDistribution.map((x) => x.total), ['#0d6efd', '#ffc107', '#dc3545']);
  drawChart('hourChart', 'bar', stats.callsByHour.map((x) => `${x.hour}:00`), stats.callsByHour.map((x) => x.total), '#6610f2');
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

  tbody.innerHTML = payload.items
    .map(
      (row) => `<tr><td>${new Date(row.call_date).toLocaleString()}</td><td>${row.source}</td><td>${row.destination}</td><td>${row.duration}</td><td>${row.status}</td><td>${row.agent}</td></tr>`
    )
    .join('');

  el('cdrPageInfo').textContent = `Page ${payload.page} / ${Math.max(1, Math.ceil(payload.total / payload.limit))}`;
};

const loadAgents = async () => {
  const response = await api('/agents');
  const agents = (await response.json()).data;
  el('agentsTable').innerHTML = agents
    .map((a) => `<tr><td>${a.name}</td><td>${a.extension}</td><td><button data-id="${a.id}" class="btn btn-sm btn-outline-danger delete-agent">Delete</button></td></tr>`)
    .join('');
};

const loadUsers = async () => {
  try {
    const response = await api('/users');
    const users = (await response.json()).data;
    el('usersTable').innerHTML = users
      .map((u) => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${new Date(u.created_at).toLocaleString()}</td><td><button data-id="${u.id}" class="btn btn-sm btn-outline-danger delete-user">Delete</button></td></tr>`)
      .join('');
  } catch (_error) {
    el('usersSection').innerHTML = '<div class="alert alert-warning">Users module requires admin role.</div>';
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
    el('settingsSection').innerHTML = '<div class="alert alert-warning">Settings module requires admin role.</div>';
  }
};

const initEvents = () => {
  el('loginBtn').addEventListener('click', login);
  el('logoutBtn').addEventListener('click', logout);
  el('refreshDashboard').addEventListener('click', loadDashboard);
  el('generateMock').addEventListener('click', async () => {
    await api('/cdr/mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 100 }) });
    notify('Mock data generated');
    await loadDashboard();
    await loadCdr();
  });

  el('toggleSidebar').addEventListener('click', () => el('sidebar').classList.toggle('collapsed'));
  el('darkModeBtn').addEventListener('click', () => {
    const html = document.documentElement;
    html.setAttribute('data-bs-theme', html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
  });

  document.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.menu-item').forEach((x) => x.classList.remove('active'));
      item.classList.add('active');
      const target = item.dataset.section;
      document.querySelectorAll('.app-section').forEach((section) => section.classList.add('d-none'));
      el(`${target}Section`).classList.remove('d-none');
    });
  });

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
      if (cdrState.sortBy === sortBy) {
        cdrState.sortOrder = cdrState.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        cdrState.sortBy = sortBy;
        cdrState.sortOrder = 'asc';
      }
      loadCdr();
    });
  });

  el('addAgentBtn').addEventListener('click', async () => {
    const name = prompt('Agent name');
    const extension = prompt('Extension');
    if (!name || !extension) return;
    await api('/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, extension }),
    });
    await loadAgents();
    notify('Agent created');
  });

  document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('delete-agent')) {
      await api(`/agents/${event.target.dataset.id}`, { method: 'DELETE' });
      await loadAgents();
      notify('Agent deleted');
    }
    if (event.target.classList.contains('delete-user')) {
      await api(`/users/${event.target.dataset.id}`, { method: 'DELETE' });
      await loadUsers();
      notify('User deleted');
    }
  });

  el('addUserBtn').addEventListener('click', async () => {
    const name = prompt('Name');
    const email = prompt('Email');
    const password = prompt('Password');
    const role = prompt('Role (admin/supervisor/viewer)', 'viewer');
    if (!name || !email || !password) return;
    await api('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });
    await loadUsers();
    notify('User created');
  });

  el('importBtn').addEventListener('click', async () => {
    const file = el('csvFile').files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await api('/import/cdr', { method: 'POST', body: formData });
    notify('CSV imported');
    await loadDashboard();
    await loadCdr();
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
    const payloads = [
      { key: 'ucm_ip', value: el('ucmIp').value },
      { key: 'api_username', value: el('apiUsername').value },
      { key: 'api_password', value: el('apiPassword').value },
    ];
    for (const payload of payloads) {
      await api('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    notify('Settings saved');
  });
};

initEvents();
if (token) {
  el('loginView').classList.add('d-none');
  el('appView').classList.remove('d-none');
  Promise.all([loadDashboard(), loadAgents(), loadUsers(), loadSettings(), loadCdr()]).catch(() => logout());
}
