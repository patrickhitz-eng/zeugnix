# Combined Patch: Selbst-Beurteilung + Route Groups + HR-Notification

Dieser Patch kombiniert drei Verbesserungen in einem einzigen Push:

## 1. Selbst-Beurteilung für KMU-Inhaber
Bei "Schritt 1" gibt es jetzt zwei Buttons:
- "Selbst beurteilen" → direkt im Dashboard ausfüllen
- "Per E-Mail einladen" → wie bisher mit Resend-Mail

Workflow reduziert von 4 auf 3 Schritte.

## 2. Beurteilungs-Loop GELÖST (Route Groups)
Manager-Beurteilungslink in der Mail führte vorher zu einem Login-Loop.
Jetzt strukturell getrennt:
- (authed) Route Group: Auth-pflichtige Bereiche (Dashboard, Zeugnisse)
- (public) Route Group: Token-basierte Invitations

URLs bleiben identisch.

## 3. HR-Benachrichtigung
Wenn Führungskraft die Beurteilung abgibt, geht automatisch eine Mail
an HR (Zeugnis-Ersteller) mit Link zum Generieren.

## STRUKTURÄNDERUNG (wichtig!)

Der `app/`-Ordner wurde umstrukturiert. Bitte den **gesamten alten
`app/`-Ordner LÖSCHEN und durch den neuen ersetzen**.

Alte Struktur:
```
app/
├── app/              ← alles unter einem Layout
│   ├── dashboard/
│   ├── certificates/
│   ├── company/
│   ├── invitations/  ← bekam fälschlicherweise Auth-Layout
│   └── layout.tsx
└── api/, login/, ...
```

Neue Struktur:
```
app/
├── (authed)/
│   └── app/
│       ├── dashboard/
│       ├── certificates/
│       │   └── [id]/
│       │       ├── evaluate/    ← NEU: Selbst-Beurteilung
│       │       ├── new/
│       │       └── page.tsx
│       ├── company/
│       └── layout.tsx
├── (public)/
│   └── app/
│       ├── invitations/    ← Token-basiert
│       └── layout.tsx
└── api/, login/, ...
```

URLs bleiben identisch:
- /app/dashboard → (authed)
- /app/certificates/[id]/evaluate → (authed)
- /app/invitations/[token] → (public)

## Vorgehen

### Schritt 1: Backup-Sicherheit

Vor dem Push: Sie sind auf main, Ihr aktueller Stand ist auf GitHub gesichert.
Falls etwas schiefgeht, können Sie jederzeit zurück.

### Schritt 2: Patch einspielen

1. ZIP entpacken
2. Im File Explorer in den Repo-Ordner gehen
3. **Den ganzen `app/`-Ordner LÖSCHEN**
4. Den `app/`-Ordner aus dem entpackten Patch reinkopieren
5. `components/app/certificate-actions.tsx` überschreiben
6. `components/forms/manager-evaluation-form.tsx` überschreiben
7. `lib/email/templates.ts` überschreiben

### Schritt 3: Commit & Push

GitHub Desktop sollte zeigen: viele Änderungen (Verschiebungen + Updates).

Commit-Message:
```
feat: selbst-beurteilung, route-groups, hr-notification
```

Commit to main → Push origin → Vercel deployt in ~2 Min.

## Test nach Deploy

1. Login mit Gmail (im Browser, nicht Outlook)
2. Bei einem Zeugnis: Schritt 1 zeigt zwei Buttons
3. "Selbst beurteilen" klicken → Beurteilungsformular
4. Ausfüllen → "Beurteilung absenden"
5. Zurück zum Zeugnis → Schritt 2 "Generieren" sollte aktiv sein
6. Generieren → Text erscheint
7. Finalisieren → Hash wird berechnet
8. Manager-Mail testen (mit anderer Adresse): Link aus Mail klicken → Beurteilungsformular ohne Login-Loop
