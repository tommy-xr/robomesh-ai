#!/bin/bash
# Simple Bash test script
NAME=${1:-World}

echo "Hello from Bash, $NAME!"
echo "Current time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
