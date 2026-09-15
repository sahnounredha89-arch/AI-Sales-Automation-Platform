const fs = require('fs');
let code = fs.readFileSync('server/services/salesAgent.ts', 'utf8');

// The block is currently:
/*
      try {
        await msgsRef.add({
          conversationId,
          direction: "outbound",
          sender: "ai",
          type: "text",
          text: responseText,
          platformMessageId: metaMsgId,
          timestamp: outNow,
        });
        await convsRef.doc(conversationId).update({
        snippet: responseText.slice(0, 120),
        lastMessageAt: outNow,
        updatedAt: outNow,
      });
      // Schedule 5-minute unanswered message alert
      await scheduleUnansweredTimer({
        conversationId,
        customerName: name,
        platform,
        aiMessageText: responseText,
      });
    }
      } catch (error) {
    console.error("Error handling customer message:", error);
  }
}
*/

const oldBlock = `        updatedAt: outNow,
      });
      // Schedule 5-minute unanswered message alert
      await scheduleUnansweredTimer({
        conversationId,
        customerName: name,
        platform,
        aiMessageText: responseText,
      });
    }
      } catch (error) {
    console.error("Error handling customer message:", error);
  }
}`;

const newBlock = `        updatedAt: outNow,
      });
      } catch (dbErr) { console.warn("Failed to save outbound message to DB", dbErr.message); }
      // Schedule 5-minute unanswered message alert
      await scheduleUnansweredTimer({
        conversationId,
        customerName: name,
        platform,
        aiMessageText: responseText,
      });
}
`;

code = code.replace(oldBlock, newBlock);

fs.writeFileSync('server/services/salesAgent.ts', code);
