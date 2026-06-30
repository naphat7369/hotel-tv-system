#!/bin/bash

echo "====================================="
echo "🚀 Hotel TV System - Auto Update"
echo "====================================="

echo "📥 1. Pulling latest code from GitHub..."
git stash
git pull origin main
git stash pop

echo "⚙️ 2. Building Backend Server..."
cd server
npm install
npm run build
cd ..

echo "🎨 3. Building CMS Frontend..."
cd cms-frontend
npm install
npm run build
cd ..

echo "📺 4. Building Portal Frontend..."
cd portal-frontend
npm install
npm run build
cd ..

echo "🔄 5. Restarting all services..."
pm2 restart all

echo "====================================="
echo "✅ Update Complete! All systems are running."
echo "====================================="
