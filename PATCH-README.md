# Patch: Route Groups + HR-Benachrichtigung

## Zwei Bug-Fixes / Verbesserungen

### 1. Loop bei Manager-Beurteilungslink GELÖST
Der Link in der Mail führte zu einem Login-Loop, weil die Invitations-Seite
fälschlicherweise das Auth-geschützte App-Layout geerbt hat. Lösung: Route
Groups – authenticated und public Bereiche sind jetzt strukturell getrennt.

### 2. HR-Benachrichtigung nach Manager-Beurteilung
Wenn die Führungskraft die Beurteilung abgibt, geht jetzt automatisch eine
Mail an HR (den Ersteller des Zeugnisses), dass es weiter geht.

## STRUKTURÄNDERUNG (wichtig!)

Das `app/`-Verzeichnis wurde umstrukturiert. **Bitte den gesamten alten
`app/`-Ordner LÖSCHEN und durch den neuen ersetzen**:

Alte Struktur:
```
app/
├── app/                    ← alles unter einem Layout
│   ├── dashboard/
│   ├── certificates/
│   ├── company/
│   ├── invitations/        ← bekam fälschlicherweise Auth-Layout
│   └── layout.tsx
└── api/, login/, ...
```

Neue Struktur:
```
app/
├── (authed)/               ← Route Group: NUR auth-pflichtig
│   └── app/
│       ├── dashboard/
│       ├── certificates/
│       ├── company/
│       └── layout.tsx      ← mit Auth-Check, Sidebar
├── (public)/               ← Route Group: KEIN Auth
│   └── app/
│       ├── invitations/    ← Token-basiert
│       └── layout.tsx      ← minimal pass-through
└── api/, login/, ...       ← unverändert
```

URLs bleiben identisch:
- /app/dashboard → (authed)
- /app/invitations/abc → (public)

## Vorgehen

### Variante A: Sicher (empfohlen)

1. ZIP entpacken
2. Im Repo: **Den ganzen `app/`-Ordner löschen** (vorher Backup machen, falls unsicher)
3. Den `app/`-Ordner aus dem Patch in den Repo-Root kopieren
4. Auch die geänderte Datei `lib/email/templates.ts` drüberkopieren
5. GitHub Desktop sollte zeigen: einige Dateien gelöscht, einige neu, einige geändert
6. Commit "fix: route groups + hr-notification" → Push

### Variante B: Manuell

Falls Sie keine Verzeichnisse löschen wollen:

1. Im Repo `app/app/` umbenennen zu `app/(authed)/app/` (mit den runden Klammern)
2. Den Inhalt von `app/(authed)/app/invitations` verschieben nach `app/(public)/app/invitations`
3. `app/(public)/app/layout.tsx` aus dem Patch hinzufügen
4. `lib/email/templates.ts` überschreiben
5. `app/api/evaluations/submit/route.ts` überschreiben
6. Commit + Push

Variante A ist robuster.
