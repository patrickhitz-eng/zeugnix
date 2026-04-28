# Patch: Marketing-Chrome + Resend-Integration

Diese Patch enthält zwei Verbesserungen:

## 1. Marketing-Chrome auf App-Routen ausblenden
Doppelter Header (Marketing + App) wird gefixt. Auf /app/*, /login, /auth ist
nun nur noch der jeweilige eigene Header sichtbar.

## 2. Resend-Integration für Manager-Einladungen
- Neue Datei: lib/email/send.ts (Mail-Versand via Resend API)
- Neue Datei: lib/email/templates.ts (HTML/Text-Vorlage in DE)
- Geänderte Datei: app/api/certificates/[id]/invite/route.ts
- Geänderte Datei: components/app/certificate-actions.tsx (zeigt Status nach Einladung)

## Dateien

```
patch-resend/
├── app/
│   ├── layout.tsx                                    [ÜBERSCHREIBEN]
│   └── api/certificates/[id]/invite/route.ts         [ÜBERSCHREIBEN]
├── components/
│   ├── app/certificate-actions.tsx                   [ÜBERSCHREIBEN]
│   └── marketing/marketing-chrome.tsx                [NEU]
└── lib/
    └── email/
        ├── send.ts                                   [NEU]
        └── templates.ts                              [NEU]
```

## Vorgehen

1. ZIP entpacken
2. Alle Dateien über bestehenden zeugnix-Repo-Inhalt drüberkopieren
3. GitHub Desktop: Commit "feat: resend-integration + marketing-chrome fix" → Push
4. Vercel deployt automatisch

## Vor dem Push noch zu erledigen: ENV-Variablen in Vercel

Folgende drei neue ENV-Variablen anlegen:

| Name | Wert |
|---|---|
| RESEND_API_KEY | re_xxxxx (aus Resend Dashboard, sobald Domain verifiziert) |
| EMAIL_FROM | noreply@zeugnix.ch |
| EMAIL_REPLY_TO | (optional, z.B. support@zeugnix.ch) |

Solange RESEND_API_KEY fehlt, läuft alles wie bisher: Einladung wird in DB
erstellt, der Link erscheint im UI zum Kopieren. Sobald Key da ist, geht
zusätzlich eine Mail raus.
