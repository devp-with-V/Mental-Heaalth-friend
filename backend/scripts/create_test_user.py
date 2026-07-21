"""
Helper script to quickly create a test user in the database.
Make sure backend/.env has the correct DATABASE_URL before running.

Run with:
  python scripts/create_test_user.py
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from core.security import hash_password
from models.db_models import User

def create_user():
    db = SessionLocal()
    try:
        email = "test@mindmate.com"
        password = "Password123!"
        name = "Test User"
        gender = "prefer_not_to_say"

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"User '{email}' already exists. You can log in with:")
            print(f"  Email:    {email}")
            print(f"  Password: {password}")
            return

        user = User(
            email=email,
            password_hash=hash_password(password),
            name=name,
            gender=gender,
        )
        db.add(user)
        db.commit()
        print("[SUCCESS] Test user created successfully!")
        print("You can log in with:")
        print(f"  Email:    {email}")
        print(f"  Password: {password}")
    except Exception as e:
        print(f"[ERROR] Error creating user: {e}")
        print("Please verify that your database URL in backend/.env is correct and you ran 'alembic upgrade head'.")
    finally:
        db.close()

if __name__ == "__main__":
    create_user()
