# 🧠 MindMate — Mental Health Companion Chatbot

MindMate is a friendly AI companion chatbot featuring four unique, culturally-aware Indian companions: Riya, Arjun, Alex, and The Guide. It features long-term memory extraction, SSE streaming, mood tracking, and safety redirect features.

---

## 🚀 Quick Start & How to Run

Follow these steps to configure, run, and check the application locally.

### 1. Environment Setup

Copy the example environment file and configure the settings:
```bash
# In the repository root:
cp backend/.env.example backend/.env
```

Open `backend/.env` and update the following settings:
- **`OPENROUTER_API_KEY`**: Set your OpenRouter API key (free models are supported).
- **`DATABASE_URL`**: Update with your local PostgreSQL user and password:
  ```env
  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/mindmate
  ```
- **`REDIS_URL`**: The application uses Redis for rate-limiting. If Redis is not running locally, the backend will **automatically fail-open** (allow all chat messages) without crashing.
  ```env
  REDIS_URL=redis://localhost:6379
  ```

---

### 2. Database Setup & Migrations

Make sure your local PostgreSQL server is running, and create a database named `mindmate`:
```sql
CREATE DATABASE mindmate;
```

Apply the database migrations to set up the tables and schemas:
```bash
cd backend

# Activate virtual environment
venv\Scripts\activate

# Run Alembic migrations to create tables
alembic upgrade head
```
*(On startup, the backend server will automatically seed the 4 companion persona records into the database).*

---

### 3. Run the Servers

#### **Backend Server**
Start the FastAPI server on port 8000:
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```
- **Interactive API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

#### **Frontend Server**
Start the React + Vite development server on port 5173:
```bash
cd frontend
npm install
npm run dev
```
- **Local Application URL:** http://localhost:5173/

---

## ⚙️ Project Architecture (Phase 1)

- **Backend (`FastAPI`):** Uses SSE (Server-Sent Events) for real-time text streaming. Authentic tokens are passed securely in the `Authorization` header instead of URL params.
- **Frontend (`React + Vite`):** A three-panel interface featuring:
  - **Left Panel:** Companion selection (Riya, Arjun, Alex, The Guide).
  - **Middle Panel:** Conversation threads unique to each companion.
  - **Right Panel:** Interactive chat window matching the color theme of the selected companion.
- **Safety / Crisis detection:** Backend automatically scans incoming messages for keywords and provides immediate helplines (including India-specific ICALL resources).


### 1. If you are using Git Bash (MINGW64) (Your current terminal)
Since you are already inside `~/Desktop/Mental Heaalth Bot/backend`, run:
```bash
# 1. Activate the virtual environment
source venv/Scripts/activate

# 2. Run migrations
alembic upgrade head

# 3. Seed the test user account
python scripts/create_test_user.py
```

---

### 2. If you open a new Command Prompt (CMD)
Navigate to the backend folder and run:
```cmd
cd "C:\Users\vedan\Desktop\Mental Heaalth Bot\backend"

# 1. Activate the virtual environment
venv\Scripts\activate

# 2. Run migrations
alembic upgrade head

# 3. Seed the test user account
python scripts/create_test_user.py
```

---

### 3. If you open a new PowerShell
Navigate to the backend folder and run:
```powershell
cd "C:\Users\vedan\Desktop\Mental Heaalth Bot\backend"

# 1. Activate the virtual environment
.\venv\Scripts\Activate.ps1

# 2. Run migrations
alembic upgrade head

# 3. Seed the test user account
python scripts/create_test_user.py
```


Email: test@mindmate.com
Password: Password123!