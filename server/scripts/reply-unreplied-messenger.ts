import { db } from "../firebase";
import { getMetaConfig, sendMetaMessage } from "../services/metaService";
import { generateSalesAgentResponse } from "../services/salesAgent";

async function main() {
  console.log("=== Checking Messenger Unreplied Messages ===");
  const config = await getMetaConfig("messenger");
  const token = config.accessToken;
  const pageId = config.pageId || "110414661460391";

  if (!token) {
    console.error("No access token found for Messenger!");
    return;
  }

  console.log(`Using Page ID: ${pageId}, Token present: ${!!token}`);

  // 1. Fetch conversations from Meta Graph API
  console.log("Fetching conversations directly from Meta Graph API...");
  const fbUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?limit=25&fields=id,updated_time,senders,messages.limit(5){id,message,created_time,from,attachments}&access_token=${encodeURIComponent(token)}`;
  
  let metaConversations: any[] = [];
  try {
    const res = await fetch(fbUrl);
    const data: any = await res.json();
    if (data.data && Array.isArray(data.data)) {
      metaConversations = data.data;
      console.log(`Retrieved ${metaConversations.length} conversations from Meta Graph API.`);
    } else {
      console.warn("Meta Graph API response:", JSON.stringify(data));
    }
  } catch (err: any) {
    console.error("Error fetching from Meta:", err.message);
  }

  // 2. Also check Firestore conversations for Messenger
  console.log("Fetching Messenger conversations from Firestore...");
  const convSnap = await db().collection("conversations")
    .where("platform", "==", "messenger")
    .get();
  console.log(`Found ${convSnap.size} Messenger conversations in Firestore.`);

  // Let's analyze each Meta conversation
  console.log("\n--- Analyzing Meta Conversations for unreplied messages ---");
  for (const conv of metaConversations) {
    const senders = conv.senders?.data || [];
    const customer = senders.find((s: any) => s.id !== pageId) || senders[0];
    const messages = conv.messages?.data || [];
    
    if (!customer) continue;
    if (messages.length === 0) continue;

    // messages.data is typically ordered newest to oldest from Graph API
    const latestMsg = messages[0];
    const isLatestFromPage = latestMsg.from?.id === pageId;
    
    console.log(`Conv ${conv.id} | Customer: ${customer.name} (${customer.id})`);
    console.log(`  Latest Msg: [${isLatestFromPage ? "PAGE" : "CUSTOMER"}] "${(latestMsg.message || "").slice(0, 50)}" at ${latestMsg.created_time}`);

    if (!isLatestFromPage) {
      console.log(`  >>> NEEDS REPLY! Customer ${customer.name} is waiting for a reply!`);
    } else {
      console.log(`  Already replied by Page.`);
    }
  }
}

main().catch(console.error);
