/* global __dirname */
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { loadEnvFile } = require('node:process');

const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

module.exports = ({ config }) => config;
