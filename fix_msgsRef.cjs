const fs = require('fs');
let code = fs.readFileSync('server/services/salesAgent.ts', 'utf8');

code = code.replace(/await msgsRef\.add/g, 'await db().collection("conversations").doc(conversationId).collection("messages").add');

fs.writeFileSync('server/services/salesAgent.ts', code);
