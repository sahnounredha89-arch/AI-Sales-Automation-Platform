/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import PaymentMethods from "./pages/PaymentMethods";
import Orders from "./pages/Orders";
import Customers from "./pages/Customers";
import Conversations from "./pages/Conversations";
import Connectors from "./pages/Connectors";
import Settings from "./pages/Settings";
import AiInstructions from "./pages/AiInstructions";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="Application Error">
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/payment-methods" element={<PaymentMethods />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/connectors" element={<Connectors />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/ai-instructions" element={<AiInstructions />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
