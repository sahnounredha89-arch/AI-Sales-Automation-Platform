const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');

const match = env.match(/FIREBASE_PRIVATE_KEY="(.*?)"/);
if (match) {
  let key = match[1];
  
  // We want to replace all backslash variations with a standard, literal newline, or just simple \n string.
  // The safest is to store it without double quotes and without any \n, or with double quotes and literal \n.
  key = key.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\\n/g, "\n");
  
  // Clean up any stray backslashes
  key = key.replace(/\\/g, "");
  
  // Replace it back, but let's make sure it has literal newlines in the string
  // and we'll use double quotes.
  let newKey = key.split('\n').map(l => l.trim()).join('\\n');
  
  env = env.replace(/FIREBASE_PRIVATE_KEY=".*?"/, `FIREBASE_PRIVATE_KEY="${newKey}"`);
  fs.writeFileSync('.env', env);
  console.log("Fixed key");
}
