# 🌱 EcoSight — AI-Powered Waste Monitoring System

EcoSight is an intelligent waste monitoring system that uses **Computer Vision + Deep Learning** to detect, classify, and track waste in real-time using any camera feed.

---

##  Overview

EcoSight deploys advanced AI techniques to:

* Detect and classify waste
* Track objects across frames
* Monitor bin levels
* Identify contamination

All of this is achieved **purely through software**, making it scalable and cost-effective.

---

## 🎯 Objectives

*  Multi-class waste detection (Plastic, Metal, Glass, Paper, Bio-Hazard)
*  Contamination alerts via liquid/opacity detection
*  Volume estimation & bin fullness tracking
*  Object tracking using DeepSORT
*  Real-time dashboard for monitoring

---

##  Tech Stack

### Frontend

* Next.js (React Framework)
* Tailwind CSS
* Clerk Authentication
* MongoDB Atlas

### Backend

* FastAPI
* Uvicorn
* OpenCV
* YOLOv8 (Object Detection)
* DeepSORT (Tracking)

---

## 📁 Project Structure

```
ecosight/
│── frontend (Next.js app)
│── backend (FastAPI app)
│── README.md
│── .gitignore
```

---

## ⚙️ Setup Instructions

### 🔹 1. Clone Repository

```bash
git clone https://github.com/praveen3349/ECOSIGHT.git
cd ECOSIGHT
```

---

##  Frontend Setup (Next.js)

```bash
cd ecosight
npm install
npm run dev
```

###  Environment Variables

Create a `.env.local` file inside `ecosight/`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key
CLERK_SECRET_KEY=your_secret
MONGODB_URI=your_mongodb_connection
```

---

##  Backend Setup (FastAPI)

```bash
cd ecosight-backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

##  How It Works

1.  Webcam / Video input
2.  YOLOv8 detects waste objects
3.  DeepSORT assigns tracking IDs
4.  Data sent to dashboard
5. Alerts generated for anomalies

---
<img width="1500" height="624" alt="image" src="https://github.com/user-attachments/assets/e725c10e-75c3-4616-a26a-7e0b9e3829e4" />

## Working 

![WhatsApp Image 2026-04-09 at 4 37 50 PM (1)](https://github.com/user-attachments/assets/4e2b252e-ded6-4409-b17c-a865dac3e9da)

![WhatsApp Image 2026-04-09 at 4 37 50 PM](https://github.com/user-attachments/assets/9be0ac62-5970-4baf-8dac-33a13a717c12)

![WhatsApp Image 2026-04-09 at 4 37 49 PM](https://github.com/user-attachments/assets/16347dbf-b2bc-4ad5-92d9-72d29de089e7)

---

## Key Features

* Real-time AI inference
* Multi-object tracking
* Scalable architecture
* Clean UI dashboard
* Secure authentication

---

## ⭐ Future Improvements

* Mobile app integration
* Edge AI deployment
* Smart bin automation
* Analytics dashboard

---

## 💡 Inspiration
Building smarter cities through AI driven waste management 🌍
