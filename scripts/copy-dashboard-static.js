const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'dashboard', 'static');
const dest = path.join(__dirname, '..', 'dist', 'dashboard', 'static');

if (!fs.existsSync(src)) {
    console.warn('copy-dashboard-static: skip, no', src);
    process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
}
console.log('copy-dashboard-static: copied to', dest);
