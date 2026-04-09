# EcoSight — Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Edit `.env.local` with your actual keys:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ecosight
```

### 3. Clerk Setup (clerk.com)
1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create a new application
3. Copy the **Publishable Key** and **Secret Key** → paste into `.env.local`
4. In Clerk Dashboard → **Sessions** tab:
   - Enable **"Customize session token"**
   - Add this JSON to **"Claims"**:
     ```json
     {
       "metadata": "{{user.public_metadata}}"
     }
     ```
   This lets the app read the user's role from the JWT.

### 4. MongoDB Atlas Setup
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free M0 cluster
3. Database Access → Add database user (username + password)
4. Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)
5. Connect → Drivers → Copy connection string
6. Replace `<password>` in the string and paste into `.env.local`

### 5. Run the App
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Role System

| Feature | Admin | Worker |
|---------|-------|--------|
| View Dashboard | ✅ | ✅ |
| View Live Feed | ✅ | ✅ |
| View Bins | ✅ | ✅ |
| Add/Delete Bins | ✅ | ❌ |
| View Audit Log | ✅ | ✅ |
| View Reports | ✅ | ✅ |
| Access Settings | ✅ | ❌ |
| Add/Remove Users | ✅ | ❌ |
| Add/Remove Cameras | ✅ | ❌ |
| Modify Thresholds | ✅ | ❌ |

**First time login flow:**
1. User signs in via Clerk
2. Redirected to `/select-role` to choose Admin or Worker
3. Role is saved to Clerk `publicMetadata`
4. Redirected to `/dashboard`

---

## Project Structure
```
src/
├── app/
│   ├── (dashboard)/       # Protected dashboard pages
│   │   ├── layout.tsx     # Sidebar + role badge
│   │   ├── dashboard/     # Overview page
│   │   ├── live-feed/     # Camera feeds
│   │   ├── bins/          # Bin management
│   │   ├── audit-log/     # Event log
│   │   ├── reports/       # Analytics
│   │   └── settings/      # Admin only
│   ├── api/
│   │   ├── set-role/      # POST: assign role to user
│   │   ├── bins/          # CRUD: bins
│   │   ├── cameras/       # CRUD: cameras
│   │   └── webhooks/      # Incoming detection events
│   ├── sign-in/           # Clerk sign-in page
│   ├── sign-up/           # Clerk sign-up page
│   └── select-role/       # Role selection after signup
├── lib/
│   ├── db.ts              # MongoDB connection
│   ├── useRole.tsx        # Client hook for role
│   └── models/            # Mongoose models
└── middleware.ts           # Route protection
```
