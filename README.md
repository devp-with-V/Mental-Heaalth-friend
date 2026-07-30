# 🧠 MindMate — Mental Health Companion Chatbot

MindMate is a modern mental health companion web application featuring four unique, culturally aware Indian companion personas (**Riya**, **Arjun**, **Alex**, and **The Guide**). It provides long-term memory recall, token-by-token SSE streaming, thread history management, mood tracking, and automated crisis detection with localized helplines.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 (App Router), React 18, Tailwind CSS, Axios, React Markdown.
- **Backend**: FastAPI, SQLAlchemy ORM, Alembic migrations, Pydantic v2, Pytest.
- **AI Integration**: OpenRouter API (`openrouter/free` auto-routing with fallback support).
- **Database**: PostgreSQL (SQLAlchemy ORM + Alembic) & Neon PostgreSQL for production.
- **Infrastructure**: Docker & Docker Compose with multi-worker Uvicorn setup.

---

## 🚀 Quick Start (Local Development)

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (if not already created)
python -m venv venv

# Activate virtual environment
# Windows (CMD): venv\Scripts\activate
# Windows (PowerShell): .\venv\Scripts\Activate.ps1
# Mac/Linux: source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template and fill in your secrets
cp .env.example .env
```

Open `backend/.env` and configure:
- `OPENROUTER_API_KEY`: Your OpenRouter API key.
- `DATABASE_URL`: PostgreSQL connection string (`postgresql://postgres:password@localhost:5432/mindmate`).
- `SECRET_KEY`: Random 32-byte hex string (`python -c "import secrets; print(secrets.token_hex(32))"`).

Run database migrations:
```bash
alembic upgrade head
```

Start the FastAPI backend:
```bash
uvicorn main:app --reload --port 8000
```
- **Interactive OpenAPI Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

---

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```

Open http://localhost:3000 in your browser. Next.js automatically proxies API calls from `/api/*` to `http://localhost:8000/api/*`.

---

## 🐳 Running with Docker Compose

Run the full stack (PostgreSQL + Redis + FastAPI Backend + Next.js Frontend) with a single command:

```bash
docker-compose up --build
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

---

## 🧪 Running Tests

Run the backend test suite:

```bash
cd backend
venv\Scripts\python -m pytest backend/tests
```

All 133 backend test cases cover authentication, JWT refresh claims, companion routing, crisis keywords, rate limiting, and memory extraction.

---

## ☁️ Cloud Deployment (Render + Vercel + Neon)

1. **Database (Neon)**: Create a free PostgreSQL instance on [Neon](https://neon.tech) and copy the connection URI.
2. **Backend (Render)**:
   - Create a Web Service pointing to the `backend/` directory.
   - Build command: `pip install -r requirements.txt`
   - Release command: `alembic upgrade head`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 4`
3. **Frontend (Vercel)**:
   - Create a new project pointing to the `frontend/` directory.
   - Set environment variable `BACKEND_URL` to your Render backend URL.

---

## 🛡️ Privacy & Safety Disclaimer

MindMate is an AI companion designed for emotional support and wellness guidance. It is **not** a substitute for professional clinical therapy or emergency healthcare services. If you or someone you know is in crisis, please reach out to dedicated emergency helplines:
- **India**: iCALL (9152987821) | Vandrevala Foundation (1860-2662-345) | Tele-MANAS (14416)
- **International**: 988 (US/Canada) | 111 (UK)

---

## 📜 License & Terms of Use

**Copyright © 2026. All Rights Reserved.**

This repository is **source-available for viewing and portfolio demonstration purposes only**.

- 👁️ **View-Only Access**: Permission is granted to view, inspect, and evaluate the source code strictly for review or portfolio assessment.
- ❌ **No Reuse or Commercial Use**: You may **not** copy, modify, distribute, sub-license, host public instances, or use any portion of this codebase for commercial or non-commercial products.
- ❌ **No Reproduction**: Unauthorised cloning, re-uploading, or reproduction of this application or its companion persona prompts is strictly prohibited.