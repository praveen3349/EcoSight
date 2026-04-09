"use client";
import { SignUp } from "@clerk/nextjs";
import { Leaf } from "lucide-react";
import { motion } from "framer-motion";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
            <Leaf className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold">EcoSight</h1>
        </div>
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "bg-card border border-border shadow-lg rounded-2xl w-full",
              headerTitle: "text-2xl font-bold text-foreground",
              headerSubtitle: "text-sm text-muted-foreground",
              formFieldLabel: "text-foreground font-medium",
              formFieldInput: "bg-background border-border text-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm",
              formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium w-full",
              footerActionLink: "text-primary hover:text-primary/90 font-medium",
            }
          }}
          fallbackRedirectUrl="/"
        />
      </motion.div>
    </div>
  );
}
