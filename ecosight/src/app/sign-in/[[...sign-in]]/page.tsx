"use client";

import { SignIn } from "@clerk/nextjs";
import { Leaf, ShieldAlert, Video, Trash2, Shield, HardHat, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Left Side */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-secondary/30 relative overflow-hidden border-r border-border">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
        </div>

        <motion.div
          className="z-10 flex items-center gap-3"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-primary p-2 rounded-xl text-primary-foreground">
            <Leaf className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">EcoSight</h1>
            <p className="text-sm text-muted-foreground">Intelligent Waste Monitoring</p>
          </div>
        </motion.div>

        <div className="z-10 space-y-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 className="text-4xl font-semibold leading-tight">
              Monitor smarter,<br />manage greener.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-md">
              Securely access your real-time dashboard, camera feeds, and operational analytics.
            </p>
          </motion.div>

          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Access Levels</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-card/60 backdrop-blur-sm border border-border px-4 py-3 rounded-xl">
                <div className="bg-primary/10 p-2 rounded-lg text-primary mt-0.5">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Administrator</p>
                  <p className="text-xs text-muted-foreground">Full access — manage bins, cameras, users & settings</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-card/60 backdrop-blur-sm border border-border px-4 py-3 rounded-xl">
                <div className="bg-amber-500/10 p-2 rounded-lg text-amber-500 mt-0.5">
                  <HardHat className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Field Worker</p>
                  <p className="text-xs text-muted-foreground">View-only — monitor feeds, bins, logs & reports</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="grid grid-cols-3 gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Video className="w-4 h-4" />
                <span className="text-xs font-medium">Active Cams</span>
              </div>
              <p className="text-2xl font-bold">2</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Trash2 className="w-4 h-4" />
                <span className="text-xs font-medium">Monitored Bins</span>
              </div>
              <p className="text-2xl font-bold">2</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium">Active Alerts</span>
              </div>
              <p className="text-2xl font-bold">1</p>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="z-10 flex items-center space-x-2 text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>All systems operational</span>
        </motion.div>
      </div>

      {/* Right Side */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
              <Leaf className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold">EcoSight</h1>
          </div>

          <SignIn
            appearance={{
              elements: {
                rootBox: "mx-auto w-full",
                card: "bg-card border border-border shadow-lg rounded-2xl w-full",
                headerTitle: "text-2xl font-bold text-foreground",
                headerSubtitle: "text-sm text-muted-foreground",
                socialButtonsBlockButton: "border border-border text-foreground hover:bg-secondary/50",
                socialButtonsBlockButtonText: "text-foreground font-medium",
                dividerLine: "bg-border",
                dividerText: "text-muted-foreground",
                formFieldLabel: "text-foreground font-medium",
                formFieldInput: "bg-background border-border text-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium w-full",
                footerActionText: "text-muted-foreground",
                footerActionLink: "text-primary hover:text-primary/90 font-medium",
                formFieldErrorText: "text-destructive",
                alertText: "text-destructive",
              }
            }}
            fallbackRedirectUrl="/dashboard"
            forceRedirectUrl="/dashboard"
          />
        </motion.div>
      </div>
    </div>
  );
}
