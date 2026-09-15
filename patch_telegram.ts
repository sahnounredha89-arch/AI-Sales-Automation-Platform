import fs from "fs";
let code = fs.readFileSync("server/services/telegramService.ts", "utf8");

const replacement = `export async function sendAdminPaymentNotification(orderId: string, options: { forceRetry?: boolean } = {}): Promise<any> {
  try {
    const { db } = await import("../firebase");
    const orderDoc = await db().collection("orders").doc(orderId).get();
    if (!orderDoc.exists) return { success: false, error: "Order not found" };
    
    const orderData = orderDoc.data()!;
    const customerName = orderData.customerName || "Customer";
    
    const result = await sendTelegramNotification(\`💳 <b>Payment Confirmed!</b>\n\nOrder for \${customerName} has been paid.\n\nProduct: \${orderData.productNameSnapshot}\`);
    return { success: true, messageId: result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}`;

code = code.replace(/export async function sendAdminPaymentNotification\(order: any, customerName: string\) \{\n  return sendTelegramNotification\(`💳 <b>Payment Confirmed!<\/b>\\n\\nOrder for \$\{customerName\} has been paid\.\\n\\nProduct: \$\{order\.productNameSnapshot\}`\);\n\}/g, replacement);

fs.writeFileSync("server/services/telegramService.ts", code);
