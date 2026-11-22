"""Restrict search to the Blitz Firebase project and bound anonymous resource use."""
from collections import deque
import os
import threading
import time

import jwt
from flask import jsonify, request
from searx.webapp import app

PROJECT = os.environ.get('BLITZ_FIREBASE_PROJECT_ID', '')
KEYS = jwt.PyJWKClient(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    cache_keys=True, lifespan=3600, timeout=5,
)
LOCK = threading.Lock()
REQUESTS = deque()


@app.before_request
def authorize_search():
    if request.path in ('/', '/health') and request.method == 'GET':
        return jsonify(service='blitz-searxng', ready=bool(PROJECT), authenticated_search=True)
    if request.path != '/search' or request.method != 'GET':
        return jsonify(error='Route unavailable'), 404
    if not PROJECT:
        return jsonify(error='Firebase project configuration required'), 503
    token = request.headers.get('Authorization', '').removeprefix('Bearer ')
    try:
        key = KEYS.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=['RS256'], audience=PROJECT,
                            issuer=f'https://securetoken.google.com/{PROJECT}',
                            options={'require': ['exp', 'iat', 'sub', 'aud', 'iss']})
        if not claims['sub'] or len(claims['sub']) > 128:
            raise jwt.InvalidTokenError('Invalid subject')
    except Exception:
        return jsonify(error='Valid Blitz session required'), 401
    query = request.args.get('q', '')
    if not query.strip() or len(query) > 600 or request.args.get('format') != 'json':
        return jsonify(error='Invalid search parameters'), 400
    if set(request.args) - {'q', 'format', 'language', 'pageno', 'time_range'}:
        return jsonify(error='Unsupported search parameter'), 400
    if request.args.get('pageno', '1') not in ('1', '2', '3'):
        return jsonify(error='Page limit exceeded'), 400
    now = time.monotonic()
    with LOCK:
        while REQUESTS and REQUESTS[0][0] <= now - 60:
            REQUESTS.popleft()
        if len(REQUESTS) >= 40 or sum(user == claims['sub'] for _, user in REQUESTS) >= 20:
            return jsonify(error='Search rate limit reached'), 429
        REQUESTS.append((now, claims['sub']))
