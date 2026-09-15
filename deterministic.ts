export function getDeterministicResponse(text: string, products: any[], paymentMethods: any[]): string | null {
  const norm = text.toLowerCase().trim();
  
  if (["وش كاين؟", "شنو المنتجات", "وش تبيعو", "products", "what do you sell"].includes(norm)) {
    if (products.length > 0) {
      return `مرحبا بك! متوفر عندنا:\n` + products.map(p => `- ${p.name} (${p.price} ${p.currency})`).join('\n') + `\n\nكيفاش نقدر نعاونك؟`;
    }
  }

  if (["طرق الدفع؟", "كيفاش نخلص", "الدفع", "ccp", "ccp?", "baridimob?", "baridimob", "redotpay", "redotpay?"].includes(norm)) {
     if (paymentMethods.length > 0) {
       return `نقبلو الدفع عبر:\n` + paymentMethods.map(p => `- ${p.name}`).join('\n') + `\n\nإذا خيرت واش تشري نعطيك تفاصيل الدفع ✅`;
     }
  }

  // Exact product price check
  if (norm.startsWith("prix") || norm.startsWith("كم السعر") || norm.startsWith("بشحال")) {
    const product = products.find(p => norm.includes(p.name.toLowerCase()));
    if (product) {
       return `نعم متوفر ${product.name} ✅\nالسعر: ${product.price} ${product.currency}\n\nطرق الدفع المتوفرة: BaridiMob, CCP, Paysera, RedotPay.\nهل تحب نعطيك تفاصيل الدفع؟`;
    }
  }

  return null;
}
