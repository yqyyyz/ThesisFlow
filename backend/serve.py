import os
import subprocess
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
LOG = "/tmp/tf_backend.log"


def kill_existing():
    subprocess.run(["pkill", "-f", "uvicorn app.main:app"], capture_output=True)
    time.sleep(1)


def start(reset_db=False):
    kill_existing()
    if reset_db:
        for f in ("thesisflow.db", "thesisflow.db-wal", "thesisflow.db-shm"):
            p = os.path.join(BACKEND_DIR, "data", f)
            if os.path.exists(p):
                os.remove(p)
        uploads = os.path.join(BACKEND_DIR, "data", "uploads", "1")
        subprocess.run(["rm", "-rf", uploads], capture_output=True)

    pid = os.fork()
    if pid > 0:
        time.sleep(6)
        return
    os.setsid()
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)
    sys.stdout.flush()
    sys.stderr.flush()
    with open(LOG, "ab") as logf:
        os.dup2(logf.fileno(), 1)
        os.dup2(logf.fileno(), 2)
    devnull = os.open(os.devnull, os.O_RDONLY)
    os.dup2(devnull, 0)
    os.chdir(BACKEND_DIR)
    os.execvp("uv", ["uv", "run", "uvicorn", "app.main:app", "--port", "8000"])


if __name__ == "__main__":
    start(reset_db="--reset" in sys.argv)
