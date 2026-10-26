import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', '1') in ('1', 'true', 'True')
    print(f"=====================================================")
    print(f"  TECNOX — AI DOWNFALL — Backend Core Engine Active")
    print(f"  Listening on http://localhost:{port}")
    print(f"  Admin credentials are configured with INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD.")
    print(f"=====================================================")
    app.run(host='0.0.0.0', port=port, debug=debug_mode, threaded=True)
