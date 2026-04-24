require('http').get('http://localhost:8787/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))
