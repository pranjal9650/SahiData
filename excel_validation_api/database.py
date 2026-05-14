import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Local dev: set DATABASE_URL=mysql+pymysql://root:PASSWORD@localhost:3306/excel_validation_db
# App Runner: leave unset — defaults to SQLite (data persists until container restarts)
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./excel_validation.db"
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
