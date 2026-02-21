#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs
from urllib.request import Request, urlopen


class AlexaBridge:
    def __init__(self, proxy_url: str | None, api_key: str | None):
        self.proxy_url = proxy_url
        self.api_key = api_key

    def ask(self, user_id: str, message: str) -> str:
        if not self.proxy_url:
            return (
                "Ich habe deine Nachricht erhalten: "
                f"'{message}'. Konfiguriere ALEXA_PROXY_URL für echte Alexa-Antworten."
            )

        payload = {
            "user_id": user_id,
            "message": message,
            "channel": "whatsapp",
        }
        body = json.dumps(payload).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        request = Request(self.proxy_url, data=body, headers=headers, method="POST")
        with urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")

        data = json.loads(raw)
        reply = data.get("reply", "Ich konnte keine Antwort von Alexa lesen.")
        return str(reply)


class WhatsAppWebhookHandler(BaseHTTPRequestHandler):
    twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    bridge = AlexaBridge(
        proxy_url=os.getenv("ALEXA_PROXY_URL"),
        api_key=os.getenv("ALEXA_PROXY_API_KEY"),
    )

    def _validate_twilio_signature(self, raw_body: bytes) -> bool:
        if not self.twilio_auth_token:
            return True

        signature = self.headers.get("X-Twilio-Signature", "")
        host = self.headers.get("Host", "localhost")
        url = f"https://{host}{self.path}"

        params = parse_qs(raw_body.decode("utf-8"), keep_blank_values=True)
        pieces = [url]
        for key in sorted(params.keys()):
            for value in sorted(params[key]):
                pieces.append(f"{key}{value}")

        expected = hmac.new(
            self.twilio_auth_token.encode("utf-8"),
            "".join(pieces).encode("utf-8"),
            hashlib.sha1,
        ).digest()

        import base64

        expected_sig = base64.b64encode(expected).decode("utf-8")
        return hmac.compare_digest(signature, expected_sig)

    def _send_twiml(self, message: str, status=HTTPStatus.OK):
        safe_message = (
            message.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        payload = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f"<Response><Message>{safe_message}</Message></Response>"
        ).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "text/xml; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/webhook/whatsapp":
            self._send_twiml("Nicht gefunden.", status=HTTPStatus.NOT_FOUND)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)

        if not self._validate_twilio_signature(raw_body):
            self._send_twiml("Ungültige Signatur.", status=HTTPStatus.FORBIDDEN)
            return

        form = parse_qs(raw_body.decode("utf-8"), keep_blank_values=True)
        incoming = form.get("Body", [""])[0].strip()
        sender = form.get("From", ["unknown"])[0]

        if not incoming:
            self._send_twiml("Bitte sende eine Nachricht.")
            return

        try:
            reply = self.bridge.ask(user_id=f"whatsapp:{sender}", message=incoming)
        except Exception:
            reply = "Der Alexa-Proxy ist gerade nicht erreichbar. Bitte später nochmal versuchen."

        self._send_twiml(reply)


def main():
    port = int(os.getenv("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), WhatsAppWebhookHandler)
    print(f"WhatsApp ↔ Alexa Bridge läuft auf Port {port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
