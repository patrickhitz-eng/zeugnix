<#
  zone-vergleich.ps1 - vergleicht die Zone zeugnio.ch bei Vercel mit der neuen Zone (Infomaniak).
  Gate fuer Cutover 0.1b: erst wenn das Skript "BEREIT" meldet, die Nameserver umstellen.
  Beschreibung und Eintragsliste: deploy/nine/dns-zone-zeugnio.md

  Aufruf in Windows PowerShell 5.1:
    powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\zeugnix-1\deploy\nine\zone-vergleich.ps1" -Neu ns11.infomaniak.ch

  Liest nur. Fragt beide Nameserver direkt (autoritativ), also nicht ueber einen Resolver.
  So laesst sich die neue Zone pruefen, bevor die Welt sie sieht.
  Die Datei ist absichtlich reines ASCII: Windows PowerShell 5.1 liest .ps1 ohne BOM als ANSI.
#>
param(
  [string]$Neu = 'ns11.infomaniak.ch',
  [string]$Alt = 'ns1.vercel-dns.com',
  [string]$Zone = 'zeugnio.ch'
)

# Namen, die in beiden Zonen dieselben Werte haben muessen ('' = Apex).
$gleich = @('', 'www', 'test', 'send', 'resend._domainkey', '_vercel')
# Namen, die bei Vercel nur den Wildcard * treffen. In der neuen Zone muss dort vor F1 nichts stehen.
$leer = @('_dmarc', 'autodiscover', 'autoconfig', 'mail', 'webmail', 'smtp', 'imap', 'pop', 'ftp', 'api', 'app', 'zz-gibt-es-nicht-4711')
$typen = @('A', 'AAAA', 'CNAME', 'MX', 'TXT')
$maxTtlApex = 300

$probleme = 0
function Melde([string]$stufe, [string]$text) {
  $farbe = @{ 'OK' = 'Green'; 'ABWEICHUNG' = 'Red'; 'FEHLER' = 'Red'; 'HINWEIS' = 'Yellow' }[$stufe]
  Write-Host ('{0,-11} {1}' -f $stufe, $text) -ForegroundColor $farbe
  if ($stufe -eq 'ABWEICHUNG' -or $stufe -eq 'FEHLER') { $script:probleme++ }
}

function Fqdn([string]$name) { if ($name -eq '') { return $Zone } else { return "$name.$Zone" } }

# Alle Antworten eines Servers fuer einen Namen, als sortierte Liste "TYP wert".
# Rueckgabe: @{ Werte = [string[]]; Ttl = @{TYP = ttl}; Fehler = [string] }
function Hole([string]$server, [string]$fqdn) {
  $werte = New-Object System.Collections.Generic.HashSet[string]
  $ttl = @{}
  $fehler = $null
  foreach ($t in $typen) {
    try {
      $antwort = Resolve-DnsName -Name $fqdn -Type $t -Server $server -DnsOnly -NoHostsFile -ErrorAction Stop
    } catch {
      $id = $_.FullyQualifiedErrorId
      if ($id -match 'NAME_ERROR|NO_RECORDS') { continue }   # Name oder Typ gibt es nicht: leer
      $fehler = "$t-Abfrage: $($_.Exception.Message)"
      break
    }
    foreach ($r in $antwort) {
      if ($r.Section -ne 'Answer') { continue }
      if ($r.Name.TrimEnd('.').ToLower() -ne $fqdn.ToLower()) { continue }
      $typ = [string]$r.QueryType
      $wert = switch ($typ) {
        'A'     { $r.IPAddress }
        'AAAA'  { $r.IPAddress }
        'CNAME' { $r.NameHost.TrimEnd('.').ToLower() }
        'MX'    { '{0} {1}' -f $r.Preference, $r.NameExchange.TrimEnd('.').ToLower() }
        'TXT'   { ($r.Strings -join '') }
        default { $null }
      }
      if ($null -eq $wert) { continue }
      [void]$werte.Add("$typ $wert")
      $ttl[$typ] = $r.TTL
    }
  }
  return @{ Werte = @($werte | Sort-Object); Ttl = $ttl; Fehler = $fehler }
}

# Vercel beantwortet den Apex aus einem Pool (gemessen 17.11.: je 2 von 4 Adressen pro Antwort).
# Darum die alte Seite mehrmals fragen und die Werte vereinigen.
function Hole-Mehrfach([string]$server, [string]$fqdn, [int]$mal) {
  $alle = New-Object System.Collections.Generic.HashSet[string]
  for ($i = 0; $i -lt $mal; $i++) {
    $e = Hole $server $fqdn
    if ($e.Fehler) { return $e }
    foreach ($w in $e.Werte) { [void]$alle.Add($w) }
  }
  return @{ Werte = @($alle | Sort-Object); Ttl = $e.Ttl; Fehler = $null }
}

# CAA (Typ 257) kennt Resolve-DnsName in PowerShell 5.1 nicht. Darum eine rohe DNS-Abfrage per UDP.
function Hole-Caa([string]$server, [string]$fqdn) {
  $ip = ([System.Net.Dns]::GetHostAddresses($server) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString
  $q = New-Object System.Collections.Generic.List[byte]
  $id = Get-Random -Minimum 1 -Maximum 65535
  # Kopf: ID, Flags 0 (keine Rekursion), 1 Frage, 0 Antworten
  $q.AddRange([byte[]]@([byte]($id -shr 8), [byte]($id -band 0xFF), 0, 0, 0, 1, 0, 0, 0, 0, 0, 0))
  foreach ($label in $fqdn.Split('.')) {
    $b = [Text.Encoding]::ASCII.GetBytes($label)
    $q.Add([byte]$b.Length); $q.AddRange($b)
  }
  $q.AddRange([byte[]]@(0, 1, 1, 0, 1))   # Namensende, Typ 257 (0x0101), Klasse IN
  $udp = New-Object System.Net.Sockets.UdpClient
  $udp.Client.ReceiveTimeout = 4000
  try {
    [void]$udp.Send($q.ToArray(), $q.Count, $ip, 53)
    $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    $r = $udp.Receive([ref]$ep)
  } finally { $udp.Close() }
  $rcode = $r[3] -band 0x0F
  $anzahl = [int]$r[6] * 256 + [int]$r[7]
  $p = 12
  while ($r[$p] -ne 0) { $p += [int]$r[$p] + 1 }
  $p += 5
  $werte = @()
  for ($i = 0; $i -lt $anzahl; $i++) {
    while ($true) {
      if (($r[$p] -band 0xC0) -eq 0xC0) { $p += 2; break }
      if ($r[$p] -eq 0) { $p += 1; break }
      $p += [int]$r[$p] + 1
    }
    $typ = [int]$r[$p] * 256 + [int]$r[$p + 1]
    $laenge = [int]$r[$p + 8] * 256 + [int]$r[$p + 9]
    $p += 10
    if ($typ -eq 257) {
      $tagLaenge = [int]$r[$p + 1]
      $tag = [Text.Encoding]::ASCII.GetString($r, $p + 2, $tagLaenge)
      $wert = [Text.Encoding]::ASCII.GetString($r, $p + 2 + $tagLaenge, $laenge - 2 - $tagLaenge)
      $werte += "$tag $wert"
    }
    $p += $laenge
  }
  return @{ Rcode = $rcode; Werte = $werte }
}

Write-Host ''
Write-Host "Zone $Zone  -  alt: $Alt  -  neu: $Neu" -ForegroundColor Cyan
Write-Host ''

# 1. Ist der neue Server fuer die Zone zustaendig?
try {
  $soa = Resolve-DnsName -Name $Zone -Type SOA -Server $Neu -DnsOnly -NoHostsFile -ErrorAction Stop | Where-Object { $_.Section -eq 'Answer' -and $_.QueryType -eq 'SOA' }
  if ($soa) { Melde 'OK' "$Neu beantwortet die Zone (SOA $($soa.PrimaryServer), Serial $($soa.SerialNumber))" }
  else { Melde 'FEHLER' "$Neu liefert kein SOA fuer $Zone. Zone angelegt? Richtiger Nameserver?" }
} catch {
  Melde 'FEHLER' "$Neu antwortet nicht fuer $Zone ($($_.Exception.Message)). Zone noch nicht angelegt oder falscher Nameserver."
  Write-Host ''
  Write-Host 'NICHT BEREIT. Weitere Pruefungen ergeben erst Sinn, wenn der neue Server die Zone kennt.' -ForegroundColor Red
  exit 1
}

# 2. Diese Namen muessen gleich sein
Write-Host ''
Write-Host 'Eintraege, die gleich sein muessen:' -ForegroundColor Cyan
foreach ($n in $gleich) {
  $f = Fqdn $n
  $mal = 2
  if ($n -eq '') { $mal = 12 }   # Apex: Pool von 4, je 2 pro Antwort; 12 Abfragen treffen alle vier praktisch sicher
  $a = Hole-Mehrfach $Alt $f $mal
  $b = Hole $Neu $f
  if ($a.Fehler) { Melde 'FEHLER' "$f bei $Alt - $($a.Fehler)"; continue }
  if ($b.Fehler) { Melde 'FEHLER' "$f bei $Neu - $($b.Fehler)"; continue }
  # A-Eintraege: neu darf eine Auswahl aus Vercels Pool sein, aber keine fremde Adresse.
  $altA = @($a.Werte | Where-Object { $_ -like 'A *' })
  $neuA = @($b.Werte | Where-Object { $_ -like 'A *' })
  $nurAlt = @($a.Werte | Where-Object { $_ -notlike 'A *' -and $b.Werte -notcontains $_ })
  $nurNeu = @($b.Werte | Where-Object { $a.Werte -notcontains $_ })
  if ($altA.Count -gt 0 -and $neuA.Count -eq 0) { $nurAlt += 'A (mindestens eine Adresse aus dem Pool)' }
  if ($nurAlt.Count -eq 0 -and $nurNeu.Count -eq 0) {
    $pool = ''
    if ($altA.Count -gt 1) { $pool = ", A: $($neuA.Count) von $($altA.Count) Adressen aus Vercels Pool" }
    Melde 'OK' "$f  ($($b.Werte.Count) Werte$pool)"
  } else {
    Melde 'ABWEICHUNG' $f
    foreach ($x in $nurAlt) { Write-Host "             fehlt neu:   $x" }
    foreach ($x in $nurNeu) { Write-Host "             nur neu:     $x" }
  }
}

# 3. Namen, die nur den Wildcard trafen, muessen neu leer sein
Write-Host ''
Write-Host 'Namen ohne Eintrag (bei Vercel nur Wildcard *):' -ForegroundColor Cyan
foreach ($n in $leer) {
  $f = Fqdn $n
  $b = Hole $Neu $f
  if ($b.Fehler) { Melde 'FEHLER' "$f - $($b.Fehler)"; continue }
  if ($b.Werte.Count -eq 0) { Melde 'OK' "$f  leer" }
  else {
    Melde 'ABWEICHUNG' "$f  sollte leer sein (Vorgabe von Infomaniak oder Wildcard?)"
    foreach ($x in $b.Werte) { Write-Host "             steht da:    $x" }
  }
}

# 4. TTL am Apex
Write-Host ''
Write-Host 'TTL:' -ForegroundColor Cyan
$apex = Hole $Neu $Zone
if ($apex.Ttl.ContainsKey('A')) {
  if ($apex.Ttl['A'] -le $maxTtlApex) { Melde 'OK' "Apex A TTL $($apex.Ttl['A']) s" }
  else { Melde 'ABWEICHUNG' "Apex A TTL $($apex.Ttl['A']) s, soll hoechstens $maxTtlApex s sein (ersetzt Cutover 0.2)" }
} else { Melde 'FEHLER' 'Apex hat in der neuen Zone keinen A-Eintrag' }

# 5. CAA: darf Let's Encrypt nicht aussperren (Zertifikat im Fenster, Cutover 5.7)
Write-Host ''
Write-Host 'CAA:' -ForegroundColor Cyan
try {
  $caaAlt = Hole-Caa $Alt $Zone
  $caaNeu = Hole-Caa $Neu $Zone
  $altText = (@($caaAlt.Werte | Sort-Object) -join ' | ')
  $neuText = (@($caaNeu.Werte | Sort-Object) -join ' | ')
  $erlaubtLe = @($caaNeu.Werte | Where-Object { $_ -match '^issue(wild)? .*letsencrypt\.org' }).Count -gt 0
  if ($caaNeu.Rcode -ne 0) { Melde 'FEHLER' "CAA-Abfrage bei ${Neu}: Antwortcode $($caaNeu.Rcode)" }
  elseif ($altText -eq $neuText) { Melde 'OK' "CAA gleich wie bei Vercel: $neuText" }
  elseif ($caaNeu.Werte.Count -eq 0) { Melde 'HINWEIS' "neu kein CAA (Vercel: $altText). Jede Zertifizierungsstelle darf ausstellen; sicher fuer das Fenster, aber lockerer als heute" }
  elseif ($erlaubtLe) { Melde 'HINWEIS' "CAA anders als bei Vercel, erlaubt aber Let's Encrypt. Neu: $neuText | Vercel: $altText" }
  else { Melde 'ABWEICHUNG' "CAA sperrt Let's Encrypt aus, das Zertifikat im Fenster (5.7) wuerde scheitern. Neu: $neuText" }
} catch { Melde 'FEHLER' "CAA-Abfrage gescheitert: $($_.Exception.Message)" }

# 6. Zur Info: welche Nameserver nennt die neue Zone selbst?
try {
  $ns = Resolve-DnsName -Name $Zone -Type NS -Server $Neu -DnsOnly -NoHostsFile -ErrorAction Stop | Where-Object { $_.Section -eq 'Answer' -and $_.QueryType -eq 'NS' }
  Write-Host ''
  Write-Host "Nameserver laut neuer Zone (diese bei Vercel eintragen): $((@($ns | ForEach-Object { $_.NameHost.TrimEnd('.') }) | Sort-Object) -join ', ')" -ForegroundColor Cyan
} catch { }

Write-Host ''
if ($probleme -eq 0) {
  Write-Host 'BEREIT: Die neue Zone antwortet wie Vercel. Nameserver duerfen umgestellt werden.' -ForegroundColor Green
  exit 0
} else {
  Write-Host "NICHT BEREIT: $probleme Punkt(e) oben in Rot." -ForegroundColor Red
  exit 1
}
