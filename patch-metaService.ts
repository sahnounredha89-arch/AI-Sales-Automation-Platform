import fs from "fs";

const content = fs.readFileSync("server/services/metaService.ts", "utf8");

// We'll replace getMetaConfig and sendMetaMessage
const newContent = content.replace(
  `export async function getMetaConfig(platform: string) {`,
  `let cachedIgAccountId: string | null = null;
export async function getMetaConfig(platform: string) {`
).replace(
  `igAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || null,`,
  `igAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || cachedIgAccountId,`
).replace(
  `  const pageId = config.pageId || "110414661460391";
  const url = \`https://graph.facebook.com/v19.0/me/messages?access_token=\${encodeURIComponent(token)}\`;`,
  `  const pageId = config.pageId || "110414661460391";
  let targetId = "me";
  if (platform === "instagram") {
    if (config.igAccountId) {
      targetId = config.igAccountId;
    } else {
      try {
        const res = await fetch(\`https://graph.facebook.com/v19.0/\${pageId}?fields=instagram_business_account&access_token=\${encodeURIComponent(token)}\`);
        const data = await res.json();
        if (data.instagram_business_account?.id) {
          targetId = data.instagram_business_account.id;
          cachedIgAccountId = targetId;
        }
      } catch (e) {
        console.warn("Failed to fetch IG account ID", e);
      }
    }
  }
  const url = \`https://graph.facebook.com/v19.0/\${targetId}/messages?access_token=\${encodeURIComponent(token)}\`;`
).replace( // Fix sendMetaSenderAction
  `  const pageId = config.pageId || "110414661460391";
  const url = \`https://graph.facebook.com/v19.0/me/messages?access_token=\${encodeURIComponent(token)}\`;`,
  `  const pageId = config.pageId || "110414661460391";
  let targetId = "me";
  if (platform === "instagram") {
    if (config.igAccountId) {
      targetId = config.igAccountId;
    } else {
      try {
        const res = await fetch(\`https://graph.facebook.com/v19.0/\${pageId}?fields=instagram_business_account&access_token=\${encodeURIComponent(token)}\`);
        const data = await res.json();
        if (data.instagram_business_account?.id) {
          targetId = data.instagram_business_account.id;
          cachedIgAccountId = targetId;
        }
      } catch (e) {}
    }
  }
  const url = \`https://graph.facebook.com/v19.0/\${targetId}/messages?access_token=\${encodeURIComponent(token)}\`;`
);

fs.writeFileSync("server/services/metaService.ts", newContent);
