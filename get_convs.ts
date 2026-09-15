import { getEnvVars, db, initFirebaseAdmin } from "./server/firebase.js";
initFirebaseAdmin();
async function run() {
  const snap = await db().collection("conversations").limit(5).get();
  snap.forEach(d => console.log(d.data()));
  process.exit(0);
}
run();
