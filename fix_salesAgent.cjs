const fs = require('fs');
let content = fs.readFileSync('server/services/salesAgent.ts', 'utf8');

const target = `        if (metaSendSuccess) {
          await db().collection("conversations").doc(conversationId).collection("messages").add({
          conversationId,
          direction: "outbound",
          sender: "ai",
          type: "text",
          text: responseText,
          channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"),
          source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"),
          origin: platform === "simulator" ? "test" : "production",
          isTest: platform === "simulator",
          platformMessageId: metaMsgId,
          timestamp: outNow,
          modelUsed,
        });
        await db().collection("conversations").doc(conversationId).update({
          snippet: responseText.slice(0, 120),
          lastMessageAt: outNow,
          updatedAt: outNow,
        });
      if (platformMessageId && platform !== "simulator") {
        await db().collection("outgoingSends").doc(platformMessageId).update({
          status: "sent",
          updatedAt: outNow
        }).catch(() => {});
        await db().collection("webhookEvents").doc(platformMessageId).update({
          status: "COMPLETED",
          processingStatus: "completed",
          modelUsed,
          completedAt: outNow,
        }).catch(() => {});
      }
      console.log(\`[GEMINI] END messageId=\${platformMessageId || 'N/A'}\`);
      console.log(\`[SEND] END messageId=\${platformMessageId || 'N/A'}\`);
      } catch (dbErr: any) {`;

const replacement = `        if (metaSendSuccess) {
          await db().collection("conversations").doc(conversationId).collection("messages").add({
            conversationId,
            direction: "outbound",
            sender: "ai",
            type: "text",
            text: responseText,
            channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"),
            source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"),
            origin: platform === "simulator" ? "test" : "production",
            isTest: platform === "simulator",
            platformMessageId: metaMsgId,
            timestamp: outNow,
            modelUsed,
          });
          
          await db().collection("conversations").doc(conversationId).update({
            snippet: responseText.slice(0, 120),
            lastMessageAt: outNow,
            updatedAt: outNow,
          });
          
          if (platformMessageId && platform !== "simulator") {
            await db().collection("outgoingSends").doc(platformMessageId).update({
              status: "sent",
              updatedAt: outNow
            }).catch(() => {});
            
            await db().collection("webhookEvents").doc(platformMessageId).update({
              status: "COMPLETED",
              processingStatus: "completed",
              modelUsed,
              completedAt: outNow,
            }).catch(() => {});
          }
          
          console.log(\`[MESSENGER_DB] outgoing_message_saved=true\`);
          console.log(\`[GEMINI] END messageId=\${platformMessageId || 'N/A'}\`);
          console.log(\`[SEND] END messageId=\${platformMessageId || 'N/A'}\`);
        } else {
          // Meta Send Failed, log it and mark webhookEvent as failed
          if (platformMessageId && platform !== "simulator") {
            await db().collection("webhookEvents").doc(platformMessageId).update({
              status: "FAILED",
              processingStatus: "failed",
              error: metaSendError || "Meta Send Failed",
              completedAt: outNow,
            }).catch(() => {});
          }
        }
      } catch (dbErr: any) {`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('server/services/salesAgent.ts', content);
  console.log("Successfully fixed salesAgent.ts!");
} else {
  console.log("Target string not found! Let me try another way.");
  const beforeEnd = content.indexOf('console.log(`[SEND] END');
  if (beforeEnd > -1) {
     const nextCatch = content.indexOf('catch (dbErr: any)', beforeEnd);
     console.log("Found locations:", beforeEnd, nextCatch);
  }
}
