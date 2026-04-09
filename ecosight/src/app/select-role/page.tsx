"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, HardHat, Leaf, ChevronRight, Check } from "lucide-react";

export default function SelectRolePage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<"admin" | "worker" | null>(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!selectedRole || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/set-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (res.ok) {
        await user?.reload();
        router.push("/dashboard");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-primary/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg z-10"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <Leaf className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight">EcoSight</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Choose Your Role</h1>
          <p className="text-muted-foreground">
            Select how you'll be using EcoSight. This determines your access level.
          </p>
        </div>

        {/* Role Cards */}
        <div className="grid gap-4 mb-8">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setSelectedRole("admin")}
            className={`relative w-full text-left p-6 rounded-2xl border-2 transition-all duration-200 ${
              selectedRole === "admin"
                ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${selectedRole === "admin" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                <Shield className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Administrator</h3>
                  {selectedRole === "admin" && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                      <Check className="w-3 h-3" /> Selected
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  Full system access — manage bins, cameras, users, alert thresholds, and view all reports.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Add/Edit Bins", "Manage Users", "Camera Config", "Alert Settings", "Full Reports"].map((perm) => (
                    <span key={perm} className="text-xs bg-secondary px-2 py-0.5 rounded-md text-muted-foreground border border-border">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setSelectedRole("worker")}
            className={`relative w-full text-left p-6 rounded-2xl border-2 transition-all duration-200 ${
              selectedRole === "worker"
                ? "border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10"
                : "border-border bg-card hover:border-amber-500/40 hover:bg-secondary/30"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${selectedRole === "worker" ? "bg-amber-500 text-white" : "bg-secondary text-foreground"}`}>
                <HardHat className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Field Worker</h3>
                  {selectedRole === "worker" && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-full">
                      <Check className="w-3 h-3" /> Selected
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  View-only access — monitor live feeds, check bin status, audit logs, and view reports.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["View Dashboard", "Live Feed", "View Bins", "Audit Log", "View Reports"].map((perm) => (
                    <span key={perm} className="text-xs bg-secondary px-2 py-0.5 rounded-md text-muted-foreground border border-border">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.button>
        </div>

        {/* Continue Button */}
        <motion.button
          whileHover={selectedRole ? { scale: 1.02 } : {}}
          whileTap={selectedRole ? { scale: 0.98 } : {}}
          onClick={handleContinue}
          disabled={!selectedRole || loading}
          className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-base transition-all duration-200 ${
            selectedRole
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg cursor-pointer"
              : "bg-secondary text-muted-foreground cursor-not-allowed opacity-60"
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Setting up your workspace...
            </span>
          ) : (
            <>
              Continue to Dashboard
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </motion.button>

        <p className="text-center text-xs text-muted-foreground mt-4">
          You can contact your administrator to change your role later.
        </p>
      </motion.div>
    </div>
  );
}
