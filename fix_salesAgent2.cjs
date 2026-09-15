const fs = require('fs');
let content = fs.readFileSync('server/services/salesAgent.ts', 'utf8');

const sendEndStr = 'console.log(`[SEND] END messageId=${platformMessageId || \'N/A\'}`);\n      } catch (dbErr: any) {';

if (content.includes(sendEndStr)) {
  content = content.replace(sendEndStr, 
`console.log(\`[SEND] END messageId=\${platformMessageId || 'N/A'}\`);
        } else {
          if (platformMessageId && platform !== "simulator") {
            await db().collection("webhookEvents").doc(platformMessageId).update({
              status: "FAILED",
              processingStatus: "failed",
              error: metaSendError || "Meta Send Failed",
              completedAt: outNow,
            }).catch(() => {});
          }
        }
      } catch (dbErr: any) {`);
  fs.writeFileSync('server/services/salesAgent.ts', content);
  console.log("Success with patch 2!");
} else {
  console.log("Not found.");
}
