import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LogOut, LayoutDashboard, Menu, X, Package, Users, MessageSquare, Settings, CreditCard, ShoppingCart, Brain } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { logout } = useAuth();
  const location = useLocation();

  const getLinkClass = (path: string) => {
    const isActive = location.pathname === path;
    return `flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
      isActive 
        ? "bg-gray-800 text-white" 
        : "text-gray-300 hover:bg-gray-800 hover:text-white"
    }`;
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-gray-100">

      {/* Mobile Header */}
      <div className="md:hidden shrink-0 flex items-center justify-between bg-gray-900 text-white p-4 z-50 relative">
        <h1 className="text-xl font-bold">AI Sales Admin</h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`${isMobileMenuOpen ? "flex" : "hidden"} md:flex w-full md:w-64 bg-gray-900 text-white flex-col z-50 overflow-y-auto absolute md:static top-[60px] bottom-0 h-[calc(100dvh-60px)] md:h-full`}>
        <div className="p-4 border-b border-gray-800 hidden md:block">
          <h1 className="text-xl font-bold">AI Sales Admin</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/dashboard" className={getLinkClass("/dashboard")}>
            <LayoutDashboard className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/products" className={getLinkClass("/products")}>
            <Package className="h-5 w-5" />
            <span>Products</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/payment-methods" className={getLinkClass("/payment-methods")}>
            <CreditCard className="h-5 w-5" />
            <span>Payment Methods</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/orders" className={getLinkClass("/orders")}>
            <ShoppingCart className="h-5 w-5" />
            <span>Orders</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/customers" className={getLinkClass("/customers")}>
            <Users className="h-5 w-5" />
            <span>Customers</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/settings" className={getLinkClass("/settings")}>
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/ai-instructions" className={getLinkClass("/ai-instructions")}>
            <Brain className="h-5 w-5" />
            <span>Instructions to AI</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/conversations" className={getLinkClass("/conversations")}>
            <MessageSquare className="h-5 w-5" />
            <span>Conversations</span>
          </Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} to="/connectors" className={getLinkClass("/connectors")}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plug"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
            <span>Connectors</span>
          </Link>
        </nav>
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">
                A
              </div>
              <div className="text-sm">
                <p className="font-medium">Admin</p>
                <p className="text-gray-400 text-xs">Administrator</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-white p-2"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8 pb-32 sm:pb-32 lg:pb-32">
          {children}
        </main>
      </div>
    </div>
  );
}
