const fs = require('fs');
const path = require('path');

const specPath = path.join(__dirname, '../docs/contracts/openapi-v1.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

const allOps = [];
for (const [urlPath, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    allOps.push({
      method: method.toUpperCase(),
      path: urlPath,
      operationId: op.operationId,
      summary: op.summary || ''
    });
  }
}

console.log('Total operations in OpenAPI:', allOps.length);

const servicesContent = fs.readFileSync(path.join(__dirname, 'api/services.js'), 'utf8');

const matched = [];
const missing = [];

allOps.forEach(op => {
  // Check if operationId or path is in services.js
  const hasOpId = op.operationId && servicesContent.includes(op.operationId);
  const cleanPath = op.path.replace(/\{[^}]+\}/g, '');
  const hasPath = servicesContent.includes(cleanPath);
  if (hasOpId || hasPath) {
    matched.push(op);
  } else {
    missing.push(op);
  }
});

console.log('\nMatched operations (' + matched.length + '):');
matched.forEach((o, idx) => console.log(`${idx + 1}. [${o.method}] ${o.path} (${o.operationId})`));

console.log('\nMissing operations (' + missing.length + '):');
missing.forEach((o, idx) => console.log(`${idx + 1}. [${o.method}] ${o.path} (${o.operationId} - ${o.summary})`));
