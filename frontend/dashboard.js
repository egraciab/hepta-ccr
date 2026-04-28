const API_BASE_URL = 'http://localhost:3000/api';

const dom = {
  totalCalls: document.getElementById('totalCalls'),
  avgDuration: document.getElementById('avgDuration'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  refreshBtn: document.getElementById('refreshBtn'),
  mockBtn: document.getElementById('mockBtn'),
};

let callsPerDayChart;
let callsPerAgentChart;
let statusDistributionChart;

const buildQueryString = () => {
  const params = new URLSearchParams();
  if (dom.startDate.value) {
    params.append('startDate', `${dom.startDate.value}T00:00:00.000Z`);
  }
  if (dom.endDate.value) {
    params.append('endDate', `${dom.endDate.value}T23:59:59.999Z`);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
};

const fetchStats = async () => {
  const response = await fetch(`${API_BASE_URL}/stats${buildQueryString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }
  const payload = await response.json();
  return payload.data;
};

const renderMetrics = (stats) => {
  dom.totalCalls.textContent = stats.totalCalls;
  dom.avgDuration.textContent = stats.averageDuration;
};

const renderCallsPerDayChart = (data) => {
  const labels = data.map((item) => new Date(item.day).toLocaleDateString());
  const totals = data.map((item) => item.total);

  if (callsPerDayChart) callsPerDayChart.destroy();

  callsPerDayChart = new Chart(document.getElementById('callsPerDayChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Calls',
          data: totals,
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13,110,253,0.15)',
          fill: true,
          tension: 0.2,
        },
      ],
    },
  });
};

const renderCallsPerAgentChart = (data) => {
  const labels = data.map((item) => item.agent);
  const totals = data.map((item) => item.total);

  if (callsPerAgentChart) callsPerAgentChart.destroy();

  callsPerAgentChart = new Chart(document.getElementById('callsPerAgentChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Calls',
          data: totals,
          backgroundColor: '#198754',
        },
      ],
    },
  });
};

const renderStatusDistributionChart = (data) => {
  const labels = data.map((item) => item.status);
  const totals = data.map((item) => item.total);

  if (statusDistributionChart) statusDistributionChart.destroy();

  statusDistributionChart = new Chart(document.getElementById('statusDistributionChart'), {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data: totals,
          backgroundColor: ['#0d6efd', '#dc3545', '#ffc107', '#20c997'],
        },
      ],
    },
  });
};

const loadDashboard = async () => {
  try {
    dom.refreshBtn.disabled = true;
    const stats = await fetchStats();
    renderMetrics(stats);
    renderCallsPerDayChart(stats.callsPerDay);
    renderCallsPerAgentChart(stats.callsPerAgent);
    renderStatusDistributionChart(stats.statusDistribution);
  } catch (error) {
    console.error(error);
    alert('Could not load dashboard data. Check backend connection.');
  } finally {
    dom.refreshBtn.disabled = false;
  }
};

const generateMockData = async () => {
  try {
    dom.mockBtn.disabled = true;
    const response = await fetch(`${API_BASE_URL}/cdr/mock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ count: 100 }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate mock data');
    }

    await loadDashboard();
  } catch (error) {
    console.error(error);
    alert('Could not generate mock data.');
  } finally {
    dom.mockBtn.disabled = false;
  }
};

dom.refreshBtn.addEventListener('click', loadDashboard);
dom.mockBtn.addEventListener('click', generateMockData);

loadDashboard();
