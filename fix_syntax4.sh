head -n 353 server/services/salesAgent.ts > server/services/salesAgent.ts.tmp
cat << 'END' >> server/services/salesAgent.ts.tmp
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
      } catch (dbErr) {
        console.warn("Failed to save outbound message to DB", dbErr.message);
      }
      
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
END
mv server/services/salesAgent.ts.tmp server/services/salesAgent.ts
