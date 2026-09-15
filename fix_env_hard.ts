import fs from "fs";
import dotenv from "dotenv";

async function run() {
  const userToken = process.env.META_PAGE_ACCESS_TOKEN;
  console.log("Current env token:", userToken?.substring(0, 30));
  
  const res = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${userToken}`);
  const data = await res.json();
  const pageToken = data.data[0].access_token;
  console.log("Real page token:", pageToken.substring(0, 30));
  
  let envFile = fs.readFileSync(".env", "utf8");
  envFile = envFile.replace(/META_PAGE_ACCESS_TOKEN=.*/, `META_PAGE_ACCESS_TOKEN=${pageToken}`);
  fs.writeFileSync(".env", envFile);
  console.log("Patched!");
}
run();
