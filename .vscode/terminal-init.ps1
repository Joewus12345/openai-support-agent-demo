# VS Code workspace terminal initializer
# Runs after the Prisma extension injects env vars, clearing any stale DATABASE_URL
# so that Prisma CLI reads the correct value from .env

Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue

# Load the user's normal PowerShell profile if it exists
if (Test-Path $PROFILE) { . $PROFILE }
