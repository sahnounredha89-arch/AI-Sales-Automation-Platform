import fs from "fs";
let code = fs.readFileSync("server/routes/connectors.ts", "utf8");

code = code.replace(
  /if \(result\.success\) \{\s*await db\(\)\.collection\("connectors"\)\.doc\("messenger"\)\.set\(\{[\s\S]*?\}, \{ merge: true \}\);\s*\}/,
  `if (result.success) {
         await db().collection("connectors").doc("messenger").set({
           status: "connected",
           messagingPermission: result.messagingPermission || "ready",
           messagingStatus: result.messagingStatus || "ready"
         }, { merge: true });
      } else {
         await db().collection("connectors").doc("messenger").set({
           status: result.authStatus === "failed" ? "failed" : "connected",
           messagingPermission: "missing",
           messagingStatus: "not_ready"
         }, { merge: true });
      }`
);

fs.writeFileSync("server/routes/connectors.ts", code);
