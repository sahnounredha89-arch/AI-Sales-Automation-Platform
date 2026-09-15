const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');

// The key currently has literal "\\n" sequences in it. 
// We want to make sure the key works perfectly.
const match = env.match(/FIREBASE_PRIVATE_KEY="(.*?)"/);
if (match) {
  let key = match[1];
  // Replace all variations of escaped newlines with actual literal \n strings (one backslash + n)
  key = key.replace(/\\\\n/g, "\\n");
  
  env = env.replace(/FIREBASE_PRIVATE_KEY=".*?"/, `FIREBASE_PRIVATE_KEY="${key}"`);
  fs.writeFileSync('.env', env);
  console.log("Fixed .env key!");
} else {
  console.log("Key not found");
}
