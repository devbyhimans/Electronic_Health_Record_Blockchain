'use strict';

function write(level, message, fields = {}) {
  const safeFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/token|secret|password|authorization|patient|name|clinical|summary|prompt|body|user/i.test(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) safeFields[key] = value;
  }
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: 'dashboard-api',
    message,
    ...safeFields,
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else console.log(line);
}

module.exports = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};
