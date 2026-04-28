require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cdrRoutes = require('./routes/cdrRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hepta-ccr-backend' });
});

app.use('/api', cdrRoutes);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`[BOOT] HEPTA CCR backend listening on port ${port}`);
});
