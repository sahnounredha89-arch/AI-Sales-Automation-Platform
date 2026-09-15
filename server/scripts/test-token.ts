import dotenv from "dotenv";
dotenv.config();

async function testToken() {
  const appId = process.env.META_APP_ID || "1006322732424651";
  const appSecret = process.env.META_APP_SECRET || "00aa3483853e2ca301992bcaa380e2ec";
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  console.log("App ID:", appId);
  console.log("Token starts with:", token?.slice(0, 20));

  // 1. Try debug_token
  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token!)}&access_token=${appId}|${appSecret}`;
  const debugRes = await fetch(debugUrl);
  const debugData = await debugRes.json();
  console.log("Debug token info:", JSON.stringify(debugData, null, 2));

  // 2. Try exchange
  const exUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(token!)}`;
  const exRes = await fetch(exUrl);
  const exData = await exRes.json();
  console.log("Exchange result:", JSON.stringify(exData, null, 2));

  process.exit(0);
}

testToken().catch(err => {
  console.error(err);
  process.exit(1);
});
