"""Start the authenticated SearXNG application on the hosting provider's port."""
import os
from pathlib import Path
import secrets
import yaml

settings = {
    'use_default_settings': {'engines': {'keep_only': ['google', 'bing', 'duckduckgo', 'brave']}},
    'general': {'instance_name': 'Blitz Search', 'debug': False},
    'server': {'secret_key': secrets.token_hex(32), 'limiter': False, 'public_instance': False},
    'search': {'formats': ['json'], 'safe_search': 1, 'default_lang': 'pt-BR'},
    'outgoing': {'request_timeout': 4.0, 'max_request_timeout': 5.0},
    'engines': [{'name': name, 'disabled': False} for name in ['google', 'bing', 'duckduckgo', 'brave']],
}
location = Path(os.environ['SEARXNG_SETTINGS_PATH'])
location.parent.mkdir(parents=True, exist_ok=True)
location.write_text(yaml.safe_dump(settings), encoding='utf-8')
os.chdir('/usr/local/searxng')
executable = '/usr/local/searxng/.venv/bin/granian'
os.execv(executable, [executable, '--interface', 'wsgi', '--host', '0.0.0.0',
                         '--port', os.environ.get('PORT', '8080'), '--workers', '1',
                         '--blocking-threads', '2', 'blitz_gateway:app'])
