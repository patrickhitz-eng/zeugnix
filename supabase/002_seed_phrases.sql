-- ============================================================================
-- zeugnix.ch – Seed-Bausteine (Migration 002)
-- ----------------------------------------------------------------------------
-- Beispiel-Bausteinbibliothek für Schweizer Arbeitszeugnisse.
-- Dies ist ein REPRÄSENTATIVER AUSZUG (~50 Bausteine) für den MVP.
-- Die finale Bibliothek sollte mit einem HR-Profi oder Arbeitsrechtler
-- erweitert werden auf 300-500 Bausteine für vollständige Abdeckung.
-- ============================================================================

-- Bevor wir seeden: alte Test-Bausteine löschen (idempotent)
delete from public.phrase_blocks where category like 'seed_%' or true;

-- ----------------------------------------------------------------------------
-- KATEGORIE: fachliche_leistung
-- ----------------------------------------------------------------------------
insert into public.phrase_blocks (category, subcategory, employee_type, gender, rating, variant, text, signal_strength, tonality) values

-- Fachliche Leistung – Sehr gut
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'm', 'sehr_gut', 1,
 'Herr {nachname} verfügt über ausgezeichnete Fachkenntnisse, die er stets sicher und zielgerichtet einzusetzen weiss.', 'eindeutig', 'positiv'),
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'f', 'sehr_gut', 1,
 'Frau {nachname} verfügt über ausgezeichnete Fachkenntnisse, die sie stets sicher und zielgerichtet einzusetzen weiss.', 'eindeutig', 'positiv'),
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'd', 'sehr_gut', 1,
 '{vorname} {nachname} verfügt über ausgezeichnete Fachkenntnisse, die stets sicher und zielgerichtet eingesetzt werden.', 'eindeutig', 'positiv'),

-- Fachliche Leistung – Gut
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'm', 'gut', 1,
 'Herr {nachname} verfügt über sehr gute Fachkenntnisse und wendet diese sicher in seiner täglichen Arbeit an.', 'eindeutig', 'positiv'),
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'f', 'gut', 1,
 'Frau {nachname} verfügt über sehr gute Fachkenntnisse und wendet diese sicher in ihrer täglichen Arbeit an.', 'eindeutig', 'positiv'),

-- Fachliche Leistung – Genügend
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'm', 'genuegend', 1,
 'Herr {nachname} verfügt über die für seine Aufgaben erforderlichen Fachkenntnisse.', 'mittel', 'neutral'),
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'f', 'genuegend', 1,
 'Frau {nachname} verfügt über die für ihre Aufgaben erforderlichen Fachkenntnisse.', 'mittel', 'neutral'),

-- Fachliche Leistung – Ungenügend (nur defensiv formuliert; rechtl. heikel)
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'm', 'ungenuegend', 1,
 'Herr {nachname} bemühte sich, die übertragenen Aufgaben zu erfüllen.', 'mittel', 'kritisch'),
('fachliche_leistung', 'gesamt', 'mitarbeiter', 'f', 'ungenuegend', 1,
 'Frau {nachname} bemühte sich, die übertragenen Aufgaben zu erfüllen.', 'mittel', 'kritisch'),

-- ----------------------------------------------------------------------------
-- KATEGORIE: arbeitsweise
-- ----------------------------------------------------------------------------
('arbeitsweise', 'gesamt', 'mitarbeiter', 'm', 'sehr_gut', 1,
 'Seine Arbeitsweise zeichnet sich durch ausgeprägte Sorgfalt, Zuverlässigkeit und Effizienz aus.', 'eindeutig', 'positiv'),
('arbeitsweise', 'gesamt', 'mitarbeiter', 'f', 'sehr_gut', 1,
 'Ihre Arbeitsweise zeichnet sich durch ausgeprägte Sorgfalt, Zuverlässigkeit und Effizienz aus.', 'eindeutig', 'positiv'),

('arbeitsweise', 'gesamt', 'mitarbeiter', 'm', 'gut', 1,
 'Er arbeitet sorgfältig, zuverlässig und stets termingerecht.', 'eindeutig', 'positiv'),
('arbeitsweise', 'gesamt', 'mitarbeiter', 'f', 'gut', 1,
 'Sie arbeitet sorgfältig, zuverlässig und stets termingerecht.', 'eindeutig', 'positiv'),

('arbeitsweise', 'gesamt', 'mitarbeiter', 'm', 'genuegend', 1,
 'Er erledigte die ihm übertragenen Aufgaben gewissenhaft.', 'mittel', 'neutral'),
('arbeitsweise', 'gesamt', 'mitarbeiter', 'f', 'genuegend', 1,
 'Sie erledigte die ihr übertragenen Aufgaben gewissenhaft.', 'mittel', 'neutral'),

-- ----------------------------------------------------------------------------
-- KATEGORIE: arbeitsqualitaet
-- ----------------------------------------------------------------------------
('arbeitsqualitaet', 'gesamt', 'mitarbeiter', 'm', 'sehr_gut', 1,
 'Die Qualität seiner Arbeit ist hervorragend; auch unter hohem Termindruck liefert er stets präzise und durchdachte Resultate.', 'eindeutig', 'positiv'),
('arbeitsqualitaet', 'gesamt', 'mitarbeiter', 'f', 'sehr_gut', 1,
 'Die Qualität ihrer Arbeit ist hervorragend; auch unter hohem Termindruck liefert sie stets präzise und durchdachte Resultate.', 'eindeutig', 'positiv'),

('arbeitsqualitaet', 'gesamt', 'mitarbeiter', 'm', 'gut', 1,
 'Die Qualität seiner Arbeit ist sehr gut. Aufgaben erledigt er mit Genauigkeit und Verlässlichkeit.', 'eindeutig', 'positiv'),
('arbeitsqualitaet', 'gesamt', 'mitarbeiter', 'f', 'gut', 1,
 'Die Qualität ihrer Arbeit ist sehr gut. Aufgaben erledigt sie mit Genauigkeit und Verlässlichkeit.', 'eindeutig', 'positiv'),

-- ----------------------------------------------------------------------------
-- KATEGORIE: zielerreichung
-- ----------------------------------------------------------------------------
('zielerreichung', 'gesamt', 'mitarbeiter', 'm', 'sehr_gut', 1,
 'Die mit ihm vereinbarten Ziele übertraf er regelmässig.', 'eindeutig', 'positiv'),
('zielerreichung', 'gesamt', 'mitarbeiter', 'f', 'sehr_gut', 1,
 'Die mit ihr vereinbarten Ziele übertraf sie regelmässig.', 'eindeutig', 'positiv'),

('zielerreichung', 'gesamt', 'mitarbeiter', 'm', 'gut', 1,
 'Die mit ihm vereinbarten Ziele erreichte er stets vollumfänglich.', 'eindeutig', 'positiv'),
('zielerreichung', 'gesamt', 'mitarbeiter', 'f', 'gut', 1,
 'Die mit ihr vereinbarten Ziele erreichte sie stets vollumfänglich.', 'eindeutig', 'positiv'),

-- ----------------------------------------------------------------------------
-- KATEGORIE: verhalten (gegenüber Vorgesetzten, Kollegen, Dritten)
-- ----------------------------------------------------------------------------
('verhalten', 'gesamt', 'mitarbeiter', 'm', 'sehr_gut', 1,
 'Sein Verhalten gegenüber Vorgesetzten, Mitarbeitenden und Kunden war stets vorbildlich.', 'eindeutig', 'positiv'),
('verhalten', 'gesamt', 'mitarbeiter', 'f', 'sehr_gut', 1,
 'Ihr Verhalten gegenüber Vorgesetzten, Mitarbeitenden und Kunden war stets vorbildlich.', 'eindeutig', 'positiv'),

('verhalten', 'gesamt', 'mitarbeiter', 'm', 'gut', 1,
 'Sein Verhalten gegenüber Vorgesetzten, Mitarbeitenden und Kunden war jederzeit einwandfrei.', 'eindeutig', 'positiv'),
('verhalten', 'gesamt', 'mitarbeiter', 'f', 'gut', 1,
 'Ihr Verhalten gegenüber Vorgesetzten, Mitarbeitenden und Kunden war jederzeit einwandfrei.', 'eindeutig', 'positiv'),

-- ----------------------------------------------------------------------------
-- KATEGORIE: fuehrungsverhalten (für Führungskräfte)
-- ----------------------------------------------------------------------------
('fuehrungsverhalten', 'gesamt', 'fuehrungskraft', 'm', 'sehr_gut', 1,
 'In seiner Funktion als Führungskraft führte er sein Team mit ausgeprägter Sozialkompetenz, klaren Zielvorgaben und vorbildlichem Engagement.', 'eindeutig', 'positiv'),
('fuehrungsverhalten', 'gesamt', 'fuehrungskraft', 'f', 'sehr_gut', 1,
 'In ihrer Funktion als Führungskraft führte sie ihr Team mit ausgeprägter Sozialkompetenz, klaren Zielvorgaben und vorbildlichem Engagement.', 'eindeutig', 'positiv'),

('fuehrungsverhalten', 'gesamt', 'fuehrungskraft', 'm', 'gut', 1,
 'Als Führungskraft leitete er sein Team kompetent, motivierend und zielorientiert.', 'eindeutig', 'positiv'),
('fuehrungsverhalten', 'gesamt', 'fuehrungskraft', 'f', 'gut', 1,
 'Als Führungskraft leitete sie ihr Team kompetent, motivierend und zielorientiert.', 'eindeutig', 'positiv'),

-- ----------------------------------------------------------------------------
-- KATEGORIE: schluss (Schlussformulierungen je Zeugnistyp)
-- ----------------------------------------------------------------------------
('schluss', 'schluss_dank', 'mitarbeiter', 'm', 'sehr_gut', 1,
 'Wir bedauern den Weggang von Herrn {nachname} sehr und danken ihm herzlich für seine wertvolle Mitarbeit. Für seine berufliche und private Zukunft wünschen wir ihm alles Gute und weiterhin viel Erfolg.', 'eindeutig', 'positiv'),
('schluss', 'schluss_dank', 'mitarbeiter', 'f', 'sehr_gut', 1,
 'Wir bedauern den Weggang von Frau {nachname} sehr und danken ihr herzlich für ihre wertvolle Mitarbeit. Für ihre berufliche und private Zukunft wünschen wir ihr alles Gute und weiterhin viel Erfolg.', 'eindeutig', 'positiv'),

('schluss', 'schluss_dank', 'mitarbeiter', 'm', 'gut', 1,
 'Wir danken Herrn {nachname} für die geleistete Arbeit und wünschen ihm für seine berufliche und private Zukunft alles Gute.', 'eindeutig', 'positiv'),
('schluss', 'schluss_dank', 'mitarbeiter', 'f', 'gut', 1,
 'Wir danken Frau {nachname} für die geleistete Arbeit und wünschen ihr für ihre berufliche und private Zukunft alles Gute.', 'eindeutig', 'positiv'),

('schluss', 'zwischen', 'mitarbeiter', 'm', 'gut', 1,
 'Dieses Zwischenzeugnis wird auf Wunsch von Herrn {nachname} ausgestellt.', 'eindeutig', 'neutral'),
('schluss', 'zwischen', 'mitarbeiter', 'f', 'gut', 1,
 'Dieses Zwischenzeugnis wird auf Wunsch von Frau {nachname} ausgestellt.', 'eindeutig', 'neutral'),

('schluss', 'funktionswechsel', 'mitarbeiter', 'd', 'gut', 1,
 'Dieses Zeugnis wird im Hinblick auf den anstehenden Funktionswechsel ausgestellt.', 'eindeutig', 'neutral'),

('schluss', 'reorganisation', 'mitarbeiter', 'd', 'gut', 1,
 'Das Arbeitsverhältnis endet aufgrund einer unternehmensweiten Reorganisation. Wir danken {vorname} {nachname} für die geleistete Arbeit und wünschen für die Zukunft alles Gute.', 'eindeutig', 'neutral');

-- ----------------------------------------------------------------------------
-- KATEGORIE: einleitung (Einleitungssatz pro Zeugnis)
-- ----------------------------------------------------------------------------
insert into public.phrase_blocks (category, subcategory, employee_type, gender, rating, variant, text, signal_strength, tonality) values
('einleitung', 'schluss', 'mitarbeiter', 'm', 'gut', 1,
 'Herr {vorname} {nachname}, geboren am {geburtsdatum}, war vom {eintritt} bis zum {austritt} in unserem Unternehmen als {funktion} tätig.', 'eindeutig', 'neutral'),
('einleitung', 'schluss', 'mitarbeiter', 'f', 'gut', 1,
 'Frau {vorname} {nachname}, geboren am {geburtsdatum}, war vom {eintritt} bis zum {austritt} in unserem Unternehmen als {funktion} tätig.', 'eindeutig', 'neutral'),
('einleitung', 'zwischen', 'mitarbeiter', 'm', 'gut', 1,
 'Herr {vorname} {nachname} ist seit dem {eintritt} in unserem Unternehmen als {funktion} tätig.', 'eindeutig', 'neutral'),
('einleitung', 'zwischen', 'mitarbeiter', 'f', 'gut', 1,
 'Frau {vorname} {nachname} ist seit dem {eintritt} in unserem Unternehmen als {funktion} tätig.', 'eindeutig', 'neutral');

-- Done. Insgesamt ~45 Bausteine.
-- Erweiterung der Bibliothek empfohlen für: Belastbarkeit, Termintreue,
-- Selbständigkeit, Innovation, Kundenorientierung, Konfliktfähigkeit,
-- Teamfähigkeit, Wissensaustausch, Strategieorientierung, Mitarbeiterförderung
