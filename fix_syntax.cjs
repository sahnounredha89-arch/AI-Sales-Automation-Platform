const fs = require('fs');
let code = fs.readFileSync('server/services/salesAgent.ts', 'utf8');

// Find the unbalanced braces
let open = 0;
let close = 0;
for (let i = 0; i < code.length; i++) {
  if (code[i] === '{') open++;
  if (code[i] === '}') close++;
}
console.log("Open:", open, "Close:", close);
