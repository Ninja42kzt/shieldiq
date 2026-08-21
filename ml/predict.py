"""
Bridge script — called from Node.js via child_process.
Reads user quiz results from stdin as JSON, returns predictions as JSON.

Usage from Node.js:
  const { execFile } = require('child_process');
  execFile('python3', ['ml/predict.py'], { input: JSON.stringify(results) }, callback);
"""

import sys
import json
import os

# Add ml directory to path
sys.path.insert(0, os.path.dirname(__file__))

try:
    from Ai import predict_for_user
    
    # Read input from stdin
    input_data = sys.stdin.read().strip()
    user_results = json.loads(input_data)
    
    result = predict_for_user(user_results)
    print(json.dumps(result))

except Exception as e:
    print(json.dumps({'error': str(e)}))
