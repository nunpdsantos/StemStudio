#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo "  StemStudio — Multi-Instrument Separator"
echo "============================================"
echo ""

# Backend setup
cd backend
if [ ! -d "venv" ]; then
    echo "First run — setting up Python environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    echo ""
else
    source venv/bin/activate
fi

# Frontend setup
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "First run — installing frontend dependencies..."
    npm install
    echo ""
fi
cd ..

# Kill any existing processes on our ports
lsof -ti:5222 | xargs kill 2>/dev/null
lsof -ti:3000 | xargs kill 2>/dev/null

# Start backend
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 5222 &
BACKEND_PID=$!
cd ..

# Start frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to be ready, then open browser
echo "Starting servers..."
sleep 3
open http://localhost:3000

echo ""
echo "StemStudio is running:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5222"
echo ""
echo "Close this window or press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
