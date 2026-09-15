const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');

const match = env.match(/FIREBASE_PRIVATE_KEY="(.*?)"/);
if (match) {
  let key = match[1];
  // Replace all backslashes followed by n with a true literal newline character
  key = key.replace(/\\\\n/g, "\n");
  key = key.replace(/\\n/g, "\n");
  
  // We don't need double quotes anymore if it has real newlines, but if we keep it, it's fine.
  env = env.replace(/FIREBASE_PRIVATE_KEY=".*?"/, `FIREBASE_PRIVATE_KEY="${key}"`);
  fs.writeFileSync('.env', env);
  console.log("Properly fixed .env key with REAL newlines");
}
