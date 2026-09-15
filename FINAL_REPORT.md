# Credential Persistence Root Cause Fix

## 1. Root Cause Identification
The root cause of credentials "disappearing" on container restart was that the application was treating Firestore as the fallback source of truth for secret credentials instead of relying exclusively on the runtime `.env` injected by AI Studio Secrets. Additionally, whenever the React UI submitted forms (e.g., changing the Meta App ID or changing the Telegram settings), it was inadvertently sending `undefined` or empty strings for the secrets since the UI no longer held them. These empty strings were then being saved back to Firestore and overwriting the in-memory `process.env`. Upon a container rebuild or restart, `syncSecrets.ts` would pull the newly blanked fields from Firestore, erasing the configuration.

## 2. Action Taken
- **Frontend Form Security**: Completely removed the input fields for `Meta App Secret` and `Telegram Bot Token` from `Settings.tsx` and `Connectors.tsx`. Replaced them with instructional callouts pointing to AI Studio Secrets, thereby removing the mechanism that sent empty secrets to the backend.
- **Backend Overwrite Prevention**: Updated `server/routes/connectors.ts` and `server/services/telegramService.ts` so they no longer attempt to save `appSecret`, `botToken`, or `adminChatId` to Firestore.
- **Secrets Synchronization Hardening**: Modified `syncSecrets.ts` to stop querying `settings/meta` or `settings/telegram` for secrets. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, and `META_APP_SECRET` now strictly rely on the server environment variables.
- **Diagnostic Endpoint**: Implemented `GET /api/admin/connectors/status` as a safe, stateless diagnostic endpoint returning boolean values (e.g. `metaAppSecretConfigured: true`) without exposing secrets.
- **Verification**: Verified the Vite and Esbuild builds complete successfully and tested that `process.env` properly loads the `.env` contents upon restart.

The regression has been successfully contained.
