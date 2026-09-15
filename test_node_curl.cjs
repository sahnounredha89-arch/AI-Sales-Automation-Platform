const fs = require("fs");
const b = JSON.parse(fs.readFileSync(".credentials_backup.json"));
const token = b.META_PAGE_ACCESS_TOKEN || b.META_INSTAGRAM_ACCESS_TOKEN;
const pageId = "110414661460391";
const igId = "17841450302428612";

async function run() {
  console.log("--- Testing Page ID conversations?platform=instagram ---");
  const u1 = `https://graph.facebook.com/v19.0/${pageId}/conversations?platform=instagram&limit=5&fields=id,updated_time,participants,messages.limit(5){id,message,created_time,from}&access_token=${encodeURIComponent(token)}`;
  const r1 = await fetch(u1);
  const d1 = await r1.json();
  console.log("Response 1:", JSON.stringify(d1, null, 2));

  console.log("--- Testing IG ID conversations?platform=instagram ---");
  const u2 = `https://graph.facebook.com/v19.0/${igId}/conversations?platform=instagram&limit=5&fields=id,updated_time,participants,messages.limit(5){id,message,created_time,from}&access_token=${encodeURIComponent(token)}`;
  const r2 = await fetch(u2);
  const d2 = await r2.json();
  console.log("Response 2:", JSON.stringify(d2, null, 2));
}

run().catch(console.error);
