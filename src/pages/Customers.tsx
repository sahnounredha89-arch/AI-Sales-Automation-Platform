import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { Users } from "lucide-react";
import { apiFetch } from "../lib/api";

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/customers")
      .then(async res => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login';
            return new Promise(() => {});
          }
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to fetch data");
        }
        return res.json();
      })
      .then(data => {
        setError(null);
        if (Array.isArray(data)) setCustomers(data); else setCustomers([]);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {error ? (
          <div className="p-6 text-center text-red-500 bg-red-50 border border-red-200 rounded-md m-4">{error}</div>
        ) : loading ? (
          <div className="p-6 text-center text-gray-500">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No customers found.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {customers.map((customer) => (
              <li key={customer.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                    <div className="text-sm text-gray-500">Platform: {customer.platform} ({customer.platformUserId})</div>
                  </div>
                </div>
                <div className="text-sm text-gray-500 text-right">
                  <div>First contact: {new Date(customer.firstContactAt).toLocaleDateString()}</div>
                  <div>Last contact: {new Date(customer.lastContactAt).toLocaleDateString()}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
