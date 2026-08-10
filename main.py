from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .database import init_database
from .routers import admin, auth, todos, users

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
FRONTEND_DIR = STATIC_DIR / "app"
FRONTEND_INDEX = FRONTEND_DIR / "index.html"

init_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def root():
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return RedirectResponse(url="/healthy")


@app.get("/healthy", status_code=200)
def health_check():
    return {"status": "Healthy"}


app.include_router(auth.router)
app.include_router(todos.router)

app.include_router(admin.router)

app.include_router(users.router)


@app.get("/login")
@app.get("/register")
@app.get("/settings")
@app.get("/app")
@app.get("/app/{full_path:path}")
def serve_frontend(full_path: str = ""):
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return RedirectResponse(url="/healthy")
