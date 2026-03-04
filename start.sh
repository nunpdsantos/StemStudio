#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Starting StemStudio..."

# Backend
cd backend
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    /opt/homebrew/bin/python3.11 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

uvicorn app.main:app --host 0.0.0.0 --port 5222 &
BACKEND_PID=$!
cd ..

# Frontend
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "StemStudio is running:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5222"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
