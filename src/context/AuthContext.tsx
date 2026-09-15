import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import app from "../lib/firebase";
import React, { createContext, useContext, useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

type AuthContextType = {
  isAuthenticated: boolean;
  loading: boolean;
  login: (token?: string) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.firebaseCustomToken) {
          try {
            const auth = getAuth(app);
            await signInWithCustomToken(auth, data.firebaseCustomToken);
          } catch(e) {
            console.error("Firebase auth error:", e);
          }
        }
        setIsAuthenticated(data.authenticated === true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = (token?: string) => {
    if (token) {
      localStorage.setItem("admin_token", token);
    }
    setIsAuthenticated(true);
  };
  
  const logout = async () => {
    try {
      localStorage.removeItem("admin_token");
      await apiFetch("/api/auth/logout", { method: "POST" });
      setIsAuthenticated(false);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
