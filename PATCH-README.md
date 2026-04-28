# Patch: PDF-Generierung robust gemacht

## Problem
React Error #31 beim PDF-Download – tritt sofort auf, auch ohne Signaturen.

## Ursache
@react-pdf/renderer ist sehr intolerant gegenüber:
- null/undefined Werten in <Text>
- Verschachtelten JSX-Expressions
- Conditional Rendering mit && (rendert "false" als String)

## Fix
Komplette PDF-Datei defensiv neu geschrieben:
- Alle Werte werden vorab zu Strings konvertiert (Helper s())
- Alle Bedingungen sind explizite .length > 0 Checks
- Kein && Shortcut mehr
- Bullet-/Datums-Sonderlogik entfernt (war potentiell der Übeltäter)

## Vorgehen
1. Datei lib/pdf/certificate.tsx im Repo durch diese ersetzen
2. Commit: "fix: pdf rendering defensiv"  
3. Push origin
4. Vercel deployt
5. Test: Bei einem finalisierten Zeugnis "PDF herunterladen" klicken
