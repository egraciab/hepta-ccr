require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const cdrRoutes = require('./routes/cdrRoutes');
const agentRoutes = require('./routes/agentRoutes');
const userRoutes = require('./routes/userRoutes');
const settingRoutes = require('./routes/settingRoutes');
const bootstrap = require('./config/bootstrap');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hepta-ccr-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api', cdrRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingRoutes);
app.use(errorHandler);

bootstrap()
  .then(() => {
    app.listen(port, () => {
      console.log(`[BOOT] HEPTA CCR backend listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('[BOOT] Failed to bootstrap app', error);
    process.exit(1);
  });
