const body = {
  "object": "page",
  "entry": [
    {
      "id": "123456789",
      "time": 123456789,
      "messaging": [
        {
          "sender": {
            "id": "12345"
          },
          "recipient": {
            "id": "123456789"
          },
          "message": {
            "mid": "m_123",
            "text": "Hello"
          }
        }
      ]
    }
  ]
};
// wait, for Instagram, does the webhook have `object: "instagram"` or `object: "page"`?
