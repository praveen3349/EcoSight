import type { Metadata } from "next"
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/providers'
import "./globals.css"

export const metadata: Metadata = {
  title: "EcoSight - Intelligent Waste Monitoring",
  description: "Modern SaaS waste monitoring platform with role-based access",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/sign-in"
    >
      <html lang="en" suppressHydrationWarning>
        <body className="antialiased font-sans bg-background text-foreground">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
