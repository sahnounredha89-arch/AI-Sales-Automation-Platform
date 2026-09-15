import dotenv from "dotenv";
dotenv.config({ override: true });
import { initFirebaseAdmin, db } from "../firebase";

async function runLifecycleTest() {
  console.log("================================================================================");
  console.log("🚀 META WEBHOOK-ONLY MESSAGE INGESTION & IDEMPOTENCY TEST SUITE");
  console.log("================================================================================\n");

  initFirebaseAdmin();

  const baseUrl = "http://localhost:3000";
  const testCustomerPsid = "CUST_TEST_" + Date.now().toString().slice(-6);
  const pageId = "110414661460391";

  let passes = 0;
  let failures = 0;

  function assert(condition: boolean, stepDesc: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${stepDesc}`);
      passes++;
    } else {
      console.error(`  ❌ [FAIL] ${stepDesc}`);
      failures++;
    }
  }

  // TEST SCENARIO 1: Real-time Inbound Message with Deterministic Availability Inquiry
  console.log("▶ TEST SCENARIO 1: Real-time Inbound Message (Deterministic Handling)");
  console.log("   Customer sends: 'سلام خويا Gemini Pro متوفر؟'");

  const mid1 = `mid.test_det_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload1 = {
    object: "page",
    entry: [
      {
        id: pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: testCustomerPsid },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: {
              mid: mid1,
              text: "سلام خويا Gemini Pro متوفر؟",
            },
          },
        ],
      },
    ],
  };

  // 1. Send webhook POST to backend
  const t0 = Date.now();
  const res1 = await fetch(`${baseUrl}/api/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload1),
  });
  const tPost = Date.now() - t0;
  const body1 = await res1.text();

  assert(res1.status === 200, `Webhook endpoint responded with HTTP 200 (${res1.status})`);
  assert(body1 === "EVENT_RECEIVED", `Webhook body is 'EVENT_RECEIVED' (received in ${tPost}ms)`);

  // 2. Verify Firestore persistence of the incoming event and wait for lifecycle completion
  console.log("   Waiting for single-job execution to complete...");
  let eventDoc1 = await db().collection("webhookEvents").doc(mid1).get();
  for (let i = 0; i < 24; i++) {
    if (eventDoc1.exists && eventDoc1.data()?.status === "COMPLETED") break;
    await new Promise((r) => setTimeout(r, 500));
    eventDoc1 = await db().collection("webhookEvents").doc(mid1).get();
  }
  assert(eventDoc1.exists, `Firestore persisted incoming webhook event under doc ID: ${mid1}`);
  
  if (eventDoc1.exists) {
    const data1 = eventDoc1.data()!;
    assert(data1.source === "meta_messenger", `Event source is 'meta_messenger'`);
    assert(data1.metaMessageId === mid1, `Captured Meta message ID matches: ${mid1}`);
    assert(data1.senderPsid === testCustomerPsid, `Sender PSID matches: ${testCustomerPsid}`);
    assert(data1.status === "COMPLETED", `Event lifecycle transitioned to 'COMPLETED' (status: ${data1.status})`);
    assert(data1.modelUsed === "deterministic_engine", `Handled deterministically (model: ${data1.modelUsed}) with 0 Gemini quota consumed`);
  }

  // 3. Verify outbound message recorded in conversations
  const convSnap1 = await db().collection("conversations")
    .where("platform", "==", "messenger")
    .where("platformUserId", "==", testCustomerPsid)
    .limit(1)
    .get();
  assert(!convSnap1.empty, `Conversation document established for customer PSID: ${testCustomerPsid}`);

  if (!convSnap1.empty) {
    const convId = convSnap1.docs[0].id;
    const msgsSnap = await db().collection("conversations").doc(convId).collection("messages").get();
    const inbound = msgsSnap.docs.filter(d => d.data().direction === "inbound");
    const outbound = msgsSnap.docs.filter(d => d.data().direction === "outbound");

    assert(inbound.length === 1, `Exactly 1 inbound message persisted in conversation`);
    assert(outbound.length === 1, `Exactly 1 outbound reply generated for the message`);
    console.log(`   Reply text: "${outbound[0]?.data()?.text?.slice(0, 75)}..."`);
  }

  // 4. Test duplicate webhook redelivery (Simulate Meta sending the exact same webhook again)
  console.log("\n▶ TEST SCENARIO 1 (Redelivery): Resending the exact same webhook event...");
  const res1Duplicate = await fetch(`${baseUrl}/api/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload1),
  });
  const body1Duplicate = await res1Duplicate.text();
  assert(res1Duplicate.status === 200, `Duplicate redelivery immediately returns HTTP 200`);
  assert(body1Duplicate === "EVENT_RECEIVED", `Duplicate redelivery returns 'EVENT_RECEIVED'`);

  // Wait to ensure no secondary job ran
  await new Promise((r) => setTimeout(r, 1000));
  if (!convSnap1.empty) {
    const convId = convSnap1.docs[0].id;
    const msgsSnapAfterDup = await db().collection("conversations").doc(convId).collection("messages").get();
    const outboundAfter = msgsSnapAfterDup.docs.filter(d => d.data().direction === "outbound");
    assert(outboundAfter.length === 1, `No duplicate outbound message created after redelivery (count: ${outboundAfter.length})`);
  }


  // TEST SCENARIO 2: Inbound Message Requiring Gemini AI Processing
  console.log("\n▶ TEST SCENARIO 2: Real-time Inbound Message (AI / Gemini Generation)");
  console.log("   Customer sends a custom question: 'خويا حبيت نسقسيك اذا نقدر نفتح الحساب في زوج تلفونات وشكرا'");

  const mid2 = `mid.test_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload2 = {
    object: "page",
    entry: [
      {
        id: pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: testCustomerPsid },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: {
              mid: mid2,
              text: "خويا حبيت نسقسيك اذا نقدر نفتح الحساب في زوج تلفونات وشكرا",
            },
          },
        ],
      },
    ],
  };

  const res2 = await fetch(`${baseUrl}/api/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2),
  });
  const body2 = await res2.text();
  assert(res2.status === 200, `Webhook responded with HTTP 200 (${res2.status})`);
  assert(body2 === "EVENT_RECEIVED", `Webhook body is 'EVENT_RECEIVED'`);

  // Wait for Gemini processing
  console.log("   Waiting for Gemini generation and single-job execution...");
  let eventDoc2 = await db().collection("webhookEvents").doc(mid2).get();
  for (let i = 0; i < 24; i++) {
    if (eventDoc2.exists && eventDoc2.data()?.status === "COMPLETED") break;
    await new Promise((r) => setTimeout(r, 500));
    eventDoc2 = await db().collection("webhookEvents").doc(mid2).get();
  }
  assert(eventDoc2.exists, `Firestore recorded AI webhook event under doc ID: ${mid2}`);
  if (eventDoc2.exists) {
    const data2 = eventDoc2.data()!;
    assert(data2.status === "COMPLETED", `AI processing completed (status: ${data2.status})`);
    console.log(`   Model utilized: ${data2.modelUsed}`);
  }

  // Check messages count for AI turn
  if (!convSnap1.empty) {
    const convId = convSnap1.docs[0].id;
    const msgsSnap2 = await db().collection("conversations").doc(convId).collection("messages").get();
    const inbound2 = msgsSnap2.docs.filter(d => d.data().direction === "inbound");
    const outbound2 = msgsSnap2.docs.filter(d => d.data().direction === "outbound");

    assert(inbound2.length === 2, `Total 2 customer messages recorded in conversation`);
    assert(outbound2.length === 2, `Total 2 replies generated (exactly 1 response per customer message)`);
    const latestReply = outbound2.sort((a, b) => (b.data().timestamp || "").localeCompare(a.data().timestamp || ""))[0];
    console.log(`   AI Reply: "${latestReply?.data()?.text?.slice(0, 80)}..."`);
  }

  // Test duplicate of AI message
  console.log("\n▶ TEST SCENARIO 2 (Redelivery): Resending the AI webhook event...");
  const res2Duplicate = await fetch(`${baseUrl}/api/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2),
  });
  assert(res2Duplicate.status === 200, `Duplicate redelivery immediately returns HTTP 200`);

  await new Promise((r) => setTimeout(r, 1000));
  if (!convSnap1.empty) {
    const convId = convSnap1.docs[0].id;
    const msgsSnapAfterDup2 = await db().collection("conversations").doc(convId).collection("messages").get();
    const outboundAfter2 = msgsSnapAfterDup2.docs.filter(d => d.data().direction === "outbound");
    assert(outboundAfter2.length === 2, `No second Gemini response or second reply generated (count still: ${outboundAfter2.length})`);
  }

  console.log("\n================================================================================");
  console.log(`📊 TEST RESULTS: ${passes} Passed, ${failures} Failed`);
  console.log("================================================================================\n");

  if (failures > 0) {
    process.exit(1);
  }
}

runLifecycleTest().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
