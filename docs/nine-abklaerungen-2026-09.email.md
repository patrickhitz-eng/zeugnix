# E-Mail-Entwurf an nine.ch Support (Stand 2026-09-16)

> Entwurf zum Kopieren an support@nine.ch. Diese Fragen blockieren die Umsetzung des
> Migrationsplans (`~/.claude/plans/2026-09-16-ch-infrastruktur-migration.md`) — Fragen 1
> und 2 entscheiden, ob die geplante Architektur überhaupt trägt. Alles davor gebaute
> wäre wertlos, wenn hier ein Nein kommt.

---

**Betreff:** Migration einer Next.js-Anwendung auf Deploio + Managed PostgreSQL – technische Vorabklärungen

Guten Tag

Wir migrieren eine Schweizer SaaS-Anwendung (Next.js, PostgreSQL) von Vercel und
Supabase vollständig auf Schweizer Infrastruktur zu Ihnen. Eine Managed PostgreSQL
haben wir bereits. Vor der Umsetzung möchten wir fünf Punkte klären, weil sie die
Architektur bestimmen.

**1. Rechte des Datenbankbenutzers (`dbadmin`)**

Wir betreiben PostgREST als Daten-API. Dafür brauchen wir in der Datenbank eigene
Rollen und ein eigenes Schema. Konkret:

- Können wir mit `dbadmin` weitere Rollen anlegen (`CREATE ROLE`), also verfügt der
  Benutzer über `CREATEROLE`?
- Können wir eigene Schemas anlegen (`CREATE SCHEMA`)?
- Können wir das Eigentum an Tabellen übertragen (`ALTER TABLE … OWNER TO <rolle>`)?

Hintergrund: Wir brauchen eine Rolle, die Row-Level-Security umgeht. Da `BYPASSRLS`
Superuser-Rechte voraussetzt, würden wir das über Tabellen-Eigentum lösen. Falls das
mit `dbadmin` nicht möglich ist: Können Sie uns die Rollen einmalig anlegen?

**2. Request-Timeout des Ingress bei Deploio**

Eine unserer Routen erzeugt PDF-Dokumente und kann bis zu 30 Sekunden Antwortzeit
brauchen. Welches Request-Timeout gilt auf dem HAProxy-Ingress vor Deploio-Apps, und
lässt es sich pro Applikation anheben? In der Dokumentation haben wir dazu keinen Wert
gefunden.

**3. Eigene Container auf Deploio**

Können wir neben der Hauptanwendung eine zweite, kleine Applikation aus einem fremden
Docker-Image betreiben (PostgREST, ein einzelner Prozess, HTTP auf einem Port)? Falls
das auf Deploio nicht vorgesehen ist: Wäre NKE der richtige Weg dafür, oder empfehlen
Sie etwas anderes?

**4. TLS zur Datenbank**

Ihre Dokumentation weist darauf hin, dass das Datenbankzertifikat selbstsigniert ist
und die CA nicht zum Hostnamen passt. Gibt es ein CA-Zertifikat, mit dem wir
`sslmode=verify-full` fahren können, oder ist `sslmode=require` der vorgesehene Weg?

**5. Datenbankzugang und Betrieb**

- Ist ein direkter Zugriff mit `pg_dump`/`psql` von aussen möglich (nach Freigabe
  unserer IP), oder läuft das über eine Bastion?
- Läuft ein Connection-Pooler vor der Datenbank, und wenn ja in welchem Modus
  (Session oder Transaction)?
- Unterstützen Sie Point-in-Time-Recovery zusätzlich zu den täglichen Backups?
- Wie lange werden Applikations- und Ingress-Logs aufbewahrt?

**6. Einordnung für unsere Datenschutzdokumentation**

Wir sagen unseren Kunden zu, dass ihre Daten die Schweiz nicht verlassen. Können Sie
uns bestätigen, dass Datenbank, Backups (lokal und remote), Object Storage und Logs
ausschliesslich in der Schweiz liegen, und uns eine Auftragsbearbeitungsvereinbarung
zustellen?

Besten Dank für Ihre Einschätzung.

Freundliche Grüsse
Silvan Schück

---

## Wovon die Antworten abhängen

| Antwort | Konsequenz |
|---|---|
| Frage 1 = nein, auch nicht über Support | Die PostgREST-Architektur trägt nicht. Rückfall auf einen eigenen Postgres-Container, womit der Vorteil der managed DB entfällt. |
| Frage 2 < 30 s und nicht anhebbar | PDF-Erzeugung muss asynchron werden (Job schreibt ins Object Storage, Client pollt). Grösserer Umbau, verschiebt den Termin. |
| Frage 3 = nein | Hosting-Entscheidung neu bewerten: NKE statt Deploio, deutlich mehr Betriebsaufwand. |
| Frage 4 = nur `require` | Akzeptabel, aber in der Sicherheitsdokumentation zu vermerken. |
| Frage 5, Pooler im Transaction-Mode | PostgREST braucht `PGRST_DB_PREPARED_STATEMENTS=false`. |
