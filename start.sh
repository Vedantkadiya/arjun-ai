#!/bin/bash

echo ""
echo "================================"
echo "  Arjun AI - Starting Server..."
echo "================================"
echo ""

PORT=3000

# Function to open browser cross-platform
open_browser() {
    sleep 1
    if command -v xdg-open &> /dev/null; then
        xdg-open "http://localhost:$PORT"   # Linux
    elif command -v open &> /dev/null; then
        open "http://localhost:$PORT"       # macOS
    fi
}

# Try Python 3
if command -v python3 &> /dev/null; then
    echo "✅ Python3 found! Starting at http://localhost:$PORT"
    echo "   Press Ctrl+C to stop."
    echo ""
    open_browser &
    python3 -m http.server $PORT
    exit 0
fi

# Try Python (could be python2 or python3)
if command -v python &> /dev/null; then
    PYVER=$(python -c 'import sys; print(sys.version_info[0])')
    if [ "$PYVER" = "3" ]; then
        echo "✅ Python found! Starting at http://localhost:$PORT"
        open_browser &
        python -m http.server $PORT
        exit 0
    fi
fi

# Try Node.js
if command -v npx &> /dev/null; then
    echo "✅ Node.js found! Starting at http://localhost:$PORT"
    open_browser &
    npx serve . -p $PORT
    exit 0
fi

# Nothing found
echo "❌ Could not find Python or Node.js."
echo ""
echo "Install one of these (free):"
echo "  Python → https://www.python.org/downloads/"
echo "  Node.js → https://nodejs.org/"
echo ""
echo "OR deploy to GitHub Pages (always works, no install needed)"
echo "   Instructions in README.md"
