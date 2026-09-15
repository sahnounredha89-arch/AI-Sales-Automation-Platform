import { getEnvVars } from "./server/firebase";
let { FIREBASE_PRIVATE_KEY: rawPrivateKey } = getEnvVars();

let privateKey = rawPrivateKey.trim();
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.substring(1, privateKey.length - 1);
}
if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
  privateKey = privateKey.substring(1, privateKey.length - 1);
}

if (privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
  let base64 = privateKey.split("-----BEGIN PRIVATE KEY-----")[1];
  base64 = base64.split("-----END PRIVATE KEY")[0];
  base64 = base64.replace(/\\n/g, "").replace(/\n/g, "").replace(/\\/g, "").replace(/\s/g, "");
  const chunks = base64.match(/.{1,64}/g) || [];
  privateKey = `-----BEGIN PRIVATE KEY-----\n${chunks.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

console.log(Buffer.from(privateKey).toString("hex"));
