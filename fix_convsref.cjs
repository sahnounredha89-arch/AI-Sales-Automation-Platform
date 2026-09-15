const fs = require('fs');
let code = fs.readFileSync('server/services/salesAgent.ts', 'utf8');

code = code.replace(/const freshConvDoc = await convsRef\.doc\(conversationId\)\.get\(\);/m, 
`
    let currentAiEnabled = true;
    let currentHumanHandoff = false;
    try {
      const freshConvDoc = await db().collection("conversations").doc(conversationId).get();
      const freshData = freshConvDoc.data();
      currentAiEnabled = freshData?.aiEnabled !== false;
      currentHumanHandoff = freshData?.humanHandoff === true;
    } catch(e) { }
`);

code = code.replace(/const freshData = freshConvDoc\.data\(\);\s*const currentAiEnabled = freshData\?\.aiEnabled !== false;\s*const currentHumanHandoff = freshData\?\.humanHandoff === true;/m, "");

fs.writeFileSync('server/services/salesAgent.ts', code);
