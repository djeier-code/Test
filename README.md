# WhatsApp ↔ Alexa Bridge (MVP)

Dieses Projekt ist ein **Starter** für eine App, mit der man per WhatsApp-Nachrichten mit einem Alexa-nahen Backend sprechen kann.

> Wichtiger Hinweis: Amazon Alexa bietet keine offizielle, direkte "Text-Chat-mit-Alexa"-Schnittstelle wie ein Messenger-Bot. Dieser MVP löst das über einen **Bridge-Ansatz**: WhatsApp-Webhook → eigener Server → Alexa-kompatibler Proxy/Skill-Backend.

## Architektur

1. WhatsApp (z. B. Twilio WhatsApp Sandbox) sendet eine eingehende Nachricht an `/webhook/whatsapp`.
2. Die Bridge validiert optional die Twilio-Signatur.
3. Die Nachricht wird an ein konfigurierbares Alexa-Proxy-Backend weitergeleitet (`ALEXA_PROXY_URL`).
4. Die Antwort wird als TwiML (`<Message>...</Message>`) an WhatsApp zurückgegeben.

## Features

- Minimaler Webhook-Server ohne externe Python-Dependencies.
- Optionale Twilio-Signaturprüfung.
- Alexa-Proxy Integration über HTTP JSON.
- Fallback-Antwort, falls kein Proxy konfiguriert ist.

## Schnellstart

```bash
python3 app.py
```

Server läuft danach auf `http://0.0.0.0:8000`.

## Environment Variablen

- `PORT` (default: `8000`)
- `TWILIO_AUTH_TOKEN` (optional, für Signaturprüfung)
- `ALEXA_PROXY_URL` (optional, z. B. API Gateway/Lambda Endpoint)
- `ALEXA_PROXY_API_KEY` (optional, als `X-API-Key` Header)

## Twilio Konfiguration

Bei der WhatsApp Sandbox / Number als Incoming Webhook setzen:

- `POST https://<deine-domain>/webhook/whatsapp`

## Beispiel Alexa Proxy Request

Der Bridge-Server schickt an `ALEXA_PROXY_URL` folgendes JSON:

```json
{
  "user_id": "whatsapp:+49123456789",
  "message": "schalte das licht im wohnzimmer an",
  "channel": "whatsapp"
}
```

Erwartete Antwort vom Proxy:

```json
{
  "reply": "Okay, ich schalte das Wohnzimmerlicht ein."
}
```

## Nächste Schritte (Produktion)

- Persistente User-Session (z. B. Redis/DynamoDB).
- Ratenlimit + Abuse-Schutz.
- Monitoring/Logging (CloudWatch, Datadog o.ä.).
- Echte Alexa-Anbindung über eigenes Skill-/Lambda-Backend oder alternativen Sprachagenten.
