TOKEN=$(node -e 'const b = JSON.parse(require("fs").readFileSync(".credentials_backup.json")); console.log(b.META_PAGE_ACCESS_TOKEN || b.META_INSTAGRAM_ACCESS_TOKEN);')
PAGE_ID="110414661460391"
IG_ID="17841450302428612"

echo "Testing URL 1 with curl:"
curl -s "https://graph.facebook.com/v19.0/${PAGE_ID}/conversations?platform=instagram&limit=5&fields=id,updated_time,senders,messages.limit(5){id,message,created_time,from}&access_token=${TOKEN}"

echo -e "\n\nTesting URL 2 with curl:"
curl -s "https://graph.facebook.com/v19.0/${IG_ID}/conversations?platform=instagram&limit=5&fields=id,updated_time,senders,messages.limit(5){id,message,created_time,from}&access_token=${TOKEN}"
