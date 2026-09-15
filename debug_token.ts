import dotenv from "dotenv";
dotenv.config({ override: true });

async function run() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  console.log("Token:", token?.substring(0, 20) + "...");
  
  // Debug using standard graph api approach (just querying it against /debug_token)
  // Actually easier to just query /me using the token. We already did that.
  
  const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
  const data = await res.json();
  console.log(data);
}
run().then(()=>process.exit(0));
