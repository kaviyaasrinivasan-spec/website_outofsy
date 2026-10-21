#!/bin/bash
# Backend Restart Script - Run this on your server after uploading the updated backend files

echo "========================================="
echo "Restarting Backend with Updated Code"
echo "========================================="
echo ""

# Stop existing backend on port 30024
echo "Step 1: Stopping existing backend on port 30024..."
if lsof -ti:30024 > /dev/null 2>&1; then
    kill -9 $(lsof -ti:30024)
    echo "✓ Stopped process on port 30024"
    sleep 1
else
    echo "✓ No process running on port 30024"
fi
echo ""

# Navigate to backend directory
echo "Step 2: Navigating to backend directory..."
cd ~/outofsyllabus/OOS/backend
echo "✓ Current directory: $(pwd)"
echo ""

# Start backend server on port 30024
echo "Step 3: Starting backend server on port 30024..."
nohup uvicorn app.main:app --host 127.0.0.1 --port 30024 > backend.log 2>&1 &
sleep 2

if lsof -ti:30024 > /dev/null 2>&1; then
    echo "✓ Backend server started successfully on port 30024"
    echo "  PID: $(lsof -ti:30024)"
else
    echo "✗ Failed to start backend server"
    echo "Check the log: tail -f backend.log"
    exit 1
fi
echo ""

echo "========================================="
echo "Backend Restart Complete!"
echo "========================================="
echo ""
echo "Backend is now running with:"
echo "  ✓ CORS enabled for outofsyllabuss.org"
echo "  ✓ All form fields made optional (except name & email)"
echo ""
echo "Test the API:"
echo "  curl https://outofsyllabuss.org/health"
echo ""
echo "View logs:"
echo "  tail -f ~/outofsyllabus/OOS/backend/backend.log"
echo ""
