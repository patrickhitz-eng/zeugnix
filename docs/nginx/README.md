# nginx-vhosts auf advisori01 (Kopie)

Kopie des vhosts, den nine auf advisori01 für zeugnio ausliefert. Stand 26.11.2026, Byte für
Byte mit `scp` vom Server geholt.

| Datei hier | Auf dem Server | Namen |
|---|---|---|
| `zeugnio.ch.conf` | `/etc/nginx/user-vhosts/zeugnio.ch.conf` | `zeugnio.ch`, `www.zeugnio.ch`, `zeugnio.ch.advisori01.nine.ch` |

Der zweite vhost `test.zeugnio.ch` (gleiche App auf `localhost:3010`, nur ein anderer Name) ist seit
27.11.2026 mit Zertifikat und DNS-Eintrag entfernt (Journal `deploy/nine/kommunikation.md`). Seine
Kopie liegt in der Git-Historie.

## Wozu die Kopie

Die Dateien gehören nicht uns. `nine-manage-vhosts` erzeugt sie aus nines Vorlage
`proxy_letsencrypt_https` mit den Variablen `PROXYPORT=3010` und `TIMEOUT=300`. Der Kopf jeder Datei
nennt Vorlage und Variablen. Ändert nine die Vorlage, zum Beispiel in einem Wartungsfenster, ändert
sich der vhost ohne Commit und ohne Nachricht. Die Kopie zeigt, was vorher galt.

Von Hand an der Datei auf dem Server zu ändern, nützt nichts: Beim nächsten Rendern überschreibt
nine sie. Geändert wird nur über `nine-manage-vhosts virtual-host update` als `www-data` (Vorlage
oder Variablen) oder per Ticket bei nine.

## Zeilen, auf die die App sich verlässt

| Zeile | Wofür | Was bricht, wenn sie fehlt |
|---|---|---|
| `proxy_set_header X-Real-IP $remote_addr;` | `lib/client-ip.ts` nimmt diesen Kopf als Client-IP für alle Rate-Limits und als `confirmed_ip` einer Freigabe. nginx ersetzt damit, was der Browser mitschickt | Jedes IP-Limit lässt sich mit einem erfundenen Kopf umgehen (Befund M1 im Sicherheitstest vom 24.11., am 26.11. als geschlossen gemessen) |
| `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` | Rückfall in `lib/client-ip.ts`: nginx hängt die echte Adresse **hinten** an, darum zählt nur der letzte Eintrag | Ohne `X-Real-IP` wäre auch der Rückfall fälschbar |
| `proxy_set_header Host $http_host;` | Weiterleitungen der Middleware folgen der aufgerufenen Adresse (`lib/public-origin.ts`) | Abgesichert: Bei einem Loopback-Host nimmt `lib/public-origin.ts` `X-Forwarded-Host` oder `NEXT_PUBLIC_SITE_URL` |
| `proxy_set_header X-Forwarded-Proto $scheme;` | Die App erkennt HTTPS hinter dem Proxy | Falsche `http://`-Adressen in Weiterleitungen |
| `proxy_read_timeout 300;` | PDF-Erzeugung und lange Anfragen | Abbruch mit 504 |
| `return 301 https://…` im Block für Port 80 | HTTP leitet auf HTTPS | Seite auch unverschlüsselt erreichbar |

## Vergleichen

Nach jedem Wartungsfenster von nine (Runbook `docs/setup-zeugnio-nine.html`, Abschnitt «Was ab jetzt
unsere Aufgabe ist»). In PowerShell aus dem Repo-Ordner, mit der Passphrase:

```powershell
scp www-zeugnio@advisori01.nine.ch:/etc/nginx/user-vhosts/zeugnio.ch.conf docs/nginx/zeugnio.ch.conf
git diff -- docs/nginx
```

Kein `git diff`: Alles ist gleich geblieben. Zeigt er Unterschiede, zuerst die Tabelle oben prüfen.
Fällt eine dieser Zeilen weg, nine fragen, bevor die neue Fassung committet wird.

In den Dateien steht kein Geheimnis: Zum Zertifikat stehen nur die Pfade, die Schlüssel selbst
liegen auf dem Server.
