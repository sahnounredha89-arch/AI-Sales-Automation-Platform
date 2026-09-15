import fs from "fs";
import path from "path";

const PRODUCTS_CACHE_FILE = path.join(process.cwd(), ".products_cache.json");
const ORDERS_CACHE_FILE = path.join(process.cwd(), ".orders_cache.json");
const PAYMENT_METHODS_CACHE_FILE = path.join(process.cwd(), ".payment_methods_cache.json");
const CONNECTORS_CACHE_FILE = path.join(process.cwd(), ".connectors_cache.json");

const DEFAULT_PRODUCTS = [
  {
    id: "gemini_pro",
    name: "Gemini Pro",
    description: "اشتراك رسمي لمدة عام كامل في خدمة الذكاء الاصطناعي الأكثر تطوراً من جوجل.",
    priceDZD: 4500,
    priceUSDT: 20,
    active: true,
    category: "AI Tools",
    deliveryType: "INSTANT_CODE",
    createdAt: new Date().toISOString(),
  },
  {
    id: "capcut_pro",
    name: "CapCut Pro",
    description: "اشتراك رسمي في برنامج كاب كات برو لتحرير الفيديو الاحترافي.",
    priceDZD: 3500,
    priceUSDT: 15,
    active: true,
    category: "Editing",
    deliveryType: "MANUAL_DELIVERY",
    createdAt: new Date().toISOString(),
  },
  {
    id: "canva_pro",
    name: "Canva Pro",
    description: "اشتراك كانفا برو بكافة القوالب والميزات الاحترافية لتصميم المحتوى.",
    priceDZD: 3000,
    priceUSDT: 14,
    active: true,
    category: "Design",
    deliveryType: "MANUAL_DELIVERY",
    createdAt: new Date().toISOString(),
  }
];

const DEFAULT_PAYMENT_METHODS = [
  {
    id: "baridimob_default",
    name: "BaridiMob",
    type: "BARIDIMOB",
    currency: "DZD",
    accountName: "Store Owner",
    accountNumber: "00799999000000000000",
    instructions: "قم بإرسال المبلغ عبر بريدي موب وإرفاق صورة الوصل.",
    active: true,
  },
  {
    id: "usdt_default",
    name: "Binance USDT",
    type: "BINANCE_PAY",
    currency: "USDT",
    accountName: "USDT Pay",
    accountNumber: "binance_id_or_trc20",
    instructions: "Send USDT (TRC20 or Binance Pay) and submit screenshot.",
    active: true,
  }
];

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as T;
    }
  } catch (err) {
    console.warn(`[LocalCache] Could not read ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn(`[LocalCache] Could not write ${filePath}:`, err);
  }
}

export const localDataCache = {
  getProducts(): any[] {
    const list = readJsonFile<any[]>(PRODUCTS_CACHE_FILE, []);
    if (!list || list.length === 0) {
      this.saveProducts(DEFAULT_PRODUCTS);
      return DEFAULT_PRODUCTS;
    }
    return list;
  },

  saveProducts(products: any[]): void {
    writeJsonFile(PRODUCTS_CACHE_FILE, products);
  },

  saveProduct(product: any): void {
    const list = this.getProducts();
    const idx = list.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...product };
    } else {
      list.push(product);
    }
    this.saveProducts(list);
  },

  getOrders(): any[] {
    return readJsonFile<any[]>(ORDERS_CACHE_FILE, []);
  },

  saveOrders(orders: any[]): void {
    writeJsonFile(ORDERS_CACHE_FILE, orders);
  },

  saveOrder(order: any): void {
    const list = this.getOrders();
    const idx = list.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...order };
    } else {
      list.unshift(order);
    }
    this.saveOrders(list);
  },

  getPaymentMethods(): any[] {
    const list = readJsonFile<any[]>(PAYMENT_METHODS_CACHE_FILE, []);
    if (!list || list.length === 0) {
      this.savePaymentMethods(DEFAULT_PAYMENT_METHODS);
      return DEFAULT_PAYMENT_METHODS;
    }
    return list;
  },

  savePaymentMethods(methods: any[]): void {
    writeJsonFile(PAYMENT_METHODS_CACHE_FILE, methods);
  },

  savePaymentMethod(method: any): void {
    const list = this.getPaymentMethods();
    const idx = list.findIndex(m => m.id === method.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...method };
    } else {
      list.push(method);
    }
    this.savePaymentMethods(list);
  },

  getConnectors(): any[] {
    return readJsonFile<any[]>(CONNECTORS_CACHE_FILE, []);
  },

  saveConnectors(connectors: any[]): void {
    writeJsonFile(CONNECTORS_CACHE_FILE, connectors);
  },

  saveConnector(connector: any): void {
    const list = this.getConnectors();
    const idx = list.findIndex(c => c.id === connector.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...connector };
    } else {
      list.push(connector);
    }
    this.saveConnectors(list);
  }
};
