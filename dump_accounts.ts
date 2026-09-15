import dotenv from "dotenv";
dotenv.config({ override: true });

async function run() {
  const userToken = process.env.META_PAGE_ACCESS_TOKEN;
  const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${userToken}`;
  const res = await fetch(accountsUrl);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run().then(()=>process.exit(0));
