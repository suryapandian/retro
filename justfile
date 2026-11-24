#!/usr/bin/env just --justfile

# Default: show available commands
default:
    @just --list

# Install dependencies for both packages
install:
    @cd worker && npm ci
    @cd frontend && npm ci

# Run all tests
test:
    @cd worker && npm test
    @cd frontend && npm test

# Start everything: worker (8787), Pages Function (8788) and Vite (5173)
dev:
    @test -f frontend/.dev.vars || cp frontend/.dev.vars.example frontend/.dev.vars
    @cd frontend && npm run build >/dev/null
    @tmux kill-session -t retro 2>/dev/null || true
    tmux new-session -d -s retro -n worker \
        -c "{{invocation_directory()}}/worker" \
        "npx wrangler dev --port 8787" \; \
        new-window -t retro -n pages \
        -c "{{invocation_directory()}}/frontend" \
        "npm run dev:pages" \; \
        new-window -t retro -n vite \
        -c "{{invocation_directory()}}/frontend" \
        "npm run dev"
    @sleep 2
    @echo "✓ Retro dev environment started: http://localhost:5173"
    @echo "  Act as someone else: http://localhost:5173/api/dev/login?as=bob@example.com"
    @echo "  (use another browser profile to be two people at once)"
    @echo "Attach with: just logs    Stop with: just kill"

# Start just the worker
worker:
    @cd worker && npx wrangler dev --port 8787

# Kill the dev session
kill:
    @tmux kill-session -t retro && echo "✓ Dev session killed"

# View logs from tmux session
logs:
    tmux attach-session -t retro

# Deploy worker then Pages (CI does this on push to main)
deploy:
    @cd worker && npm run deploy
    @cd frontend && npm run deploy
