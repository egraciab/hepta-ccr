#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { signLicense } = require('../backend/src/config/license');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

if (!args.client || !args.support_until || !args.machine_id) {
  console.error('Usage: node scripts/generate-license.js --client="Ideas & Negocios S.A." --support_until=2027-05-10 --machine_id=auto [--output=config/license.json]');
  process.exit(1);
}

const license = {
  client: args.client,
  type: args.type || 'perpetual',
  issued_at: args.issued_at || new Date().toISOString().slice(0, 10),
  support_until: args.support_until,
  machine_id: args.machine_id,
  features: args.features ? args.features.split(',').map((item) => item.trim()).filter(Boolean) : ['full'],
};

license.signature = signLicense(license);

const output = args.output;
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(license, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(license, null, 2)}\n`);
}
