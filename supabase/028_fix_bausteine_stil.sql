-- 028_fix_bausteine_stil.sql
-- Stil- und Syntaxkorrekturen der Katalog-Bausteine (Befund aus dem Review
-- eines Zwischenzeugnisses, 2026-10-23). Seeds 009 + 015 sind bereits
-- korrigiert; diese Migration zieht die laufende Prod-DB nach.
--   * Komma statt «und» vor dem zweiten Verb (vorbild)
--   * «Wir schätzen enorm» (umgangssprachlich) + «engagierter» (Wiederholung)
--   * «versteht es gekonnt» (Pleonasmus, Doppel mit lenkung_arbeitsleistung)
--   * «ermöglicht … Weiterbildungsmöglichkeiten» (Pleonasmus, Empfänger fehlt)
--   * «setzt {vorname} {nachname} sich» → «setzt sich {vorname} {nachname}»
--   * «konstruktiven sowie positiven» → «und»
--   * «ein einwandfreies Arbeitsergebnis» → Plural
--   * «verfügt über Selbstdisziplin» → «ist selbstdiszipliniert»
-- Manuell im Supabase-SQL-Editor (Projekt "zeugnix") ausführen.
-- Idempotent: jedes Statement matcht zusätzlich auf den ALTEN Text und
-- trifft beim zweiten Lauf nichts mehr. Erwartung beim ersten Lauf: 24 UPDATE-Treffer.
-- Bereits generierte Zeugnisse (certificates.generated_text) bleiben unverändert.
-- Generiert aus dem Diff alt/neu von 009 + 015 (nicht von Hand).

begin;

-- arbeitsqualitaet / gut / Variante 2 / praesens
update public.phrase_blocks set text = 'Durch {{seine|ihre|seine/ihre}} Sorgfalt und Gewissenhaftigkeit erzielt {{er|sie|er/sie}} einwandfreie Arbeitsergebnisse.'
 where category = 'arbeitsqualitaet' and subcategory = 'arbeitsweise_leistung'
   and employee_type = 'mitarbeiter' and rating = 'gut' and variant = 2
   and tempus = 'praesens'
   and text = 'Durch {{seine|ihre|seine/ihre}} Sorgfalt und Gewissenhaftigkeit erzielt {{er|sie|er/sie}} ein einwandfreies Arbeitsergebnis.';

-- arbeitsqualitaet / gut / Variante 2 / praeteritum
update public.phrase_blocks set text = 'Durch {{seine|ihre|seine/ihre}} Sorgfalt und Gewissenhaftigkeit erzielte {{er|sie|er/sie}} einwandfreie Arbeitsergebnisse.'
 where category = 'arbeitsqualitaet' and subcategory = 'arbeitsweise_leistung'
   and employee_type = 'mitarbeiter' and rating = 'gut' and variant = 2
   and tempus = 'praeteritum'
   and text = 'Durch {{seine|ihre|seine/ihre}} Sorgfalt und Gewissenhaftigkeit erzielte {{er|sie|er/sie}} ein einwandfreies Arbeitsergebnis.';

-- fachkenntnisse_lernbereitschaft / genuegend / Variante 3 / praesens
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzt sich {vorname} {nachname} auseinander und ist mit den aktuellen Standards vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'genuegend' and variant = 3
   and tempus = 'praesens'
   and text = 'Mit Entwicklungen im Berufsumfeld setzt {vorname} {nachname} sich auseinander und ist mit den aktuellen Standards vertraut.';

-- fachkenntnisse_lernbereitschaft / genuegend / Variante 3 / praeteritum
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzte sich {vorname} {nachname} auseinander und war mit den aktuellen Standards vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'genuegend' and variant = 3
   and tempus = 'praeteritum'
   and text = 'Mit Entwicklungen im Berufsumfeld setzte {vorname} {nachname} sich auseinander und war mit den aktuellen Standards vertraut.';

-- fachkenntnisse_lernbereitschaft / gut / Variante 3 / praesens
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzt sich {vorname} {nachname} auseinander und ist immer mit den aktuellen Standards vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'gut' and variant = 3
   and tempus = 'praesens'
   and text = 'Mit Entwicklungen im Berufsumfeld setzt {vorname} {nachname} sich auseinander und ist immer mit den aktuellen Standards vertraut.';

-- fachkenntnisse_lernbereitschaft / gut / Variante 3 / praeteritum
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzte sich {vorname} {nachname} auseinander und war immer mit den aktuellen Standards vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'gut' and variant = 3
   and tempus = 'praeteritum'
   and text = 'Mit Entwicklungen im Berufsumfeld setzte {vorname} {nachname} sich auseinander und war immer mit den aktuellen Standards vertraut.';

-- fachkenntnisse_lernbereitschaft / sehr_gut / Variante 3 / praesens
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzt sich {vorname} {nachname} engagiert auseinander und ist immer mit den neuesten Standards vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'sehr_gut' and variant = 3
   and tempus = 'praesens'
   and text = 'Mit Entwicklungen im Berufsumfeld setzt {vorname} {nachname} sich engagiert auseinander und ist immer mit den neuesten Standards vertraut.';

-- fachkenntnisse_lernbereitschaft / sehr_gut / Variante 3 / praeteritum
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzte sich {vorname} {nachname} engagiert auseinander und war immer mit den neuesten Standards vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'sehr_gut' and variant = 3
   and tempus = 'praeteritum'
   and text = 'Mit Entwicklungen im Berufsumfeld setzte {vorname} {nachname} sich engagiert auseinander und war immer mit den neuesten Standards vertraut.';

-- fachkenntnisse_lernbereitschaft / ungenuegend / Variante 3 / praesens
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzt sich {vorname} {nachname} nur teilweise auseinander und ist mit wichtigen Standards zu wenig vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'ungenuegend' and variant = 3
   and tempus = 'praesens'
   and text = 'Mit Entwicklungen im Berufsumfeld setzt {vorname} {nachname} sich nur teilweise auseinander und ist mit wichtigen Standards zu wenig vertraut.';

-- fachkenntnisse_lernbereitschaft / ungenuegend / Variante 3 / praeteritum
update public.phrase_blocks set text = 'Mit Entwicklungen im Berufsumfeld setzte sich {vorname} {nachname} nur teilweise auseinander und war mit wichtigen Standards zu wenig vertraut.'
 where category = 'fachkenntnisse_lernbereitschaft' and subcategory = 'arbeitsbereitschaft_fachwissen'
   and employee_type = 'mitarbeiter' and rating = 'ungenuegend' and variant = 3
   and tempus = 'praeteritum'
   and text = 'Mit Entwicklungen im Berufsumfeld setzte {vorname} {nachname} sich nur teilweise auseinander und war mit wichtigen Standards zu wenig vertraut.';

-- mitarbeiterfoerderung / gut / Variante 2 / praesens
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} versteht es, die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden zu erkennen und diese zu fördern. {{Er|Sie|Er/Sie}} ermöglicht ihnen auf die Funktion zugeschnittene Weiterbildungen und zeigt Entwicklungsperspektiven auf.'
 where category = 'mitarbeiterfoerderung' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'gut' and variant = 2
   and tempus = 'praesens'
   and text = '{{Er|Sie|Er/Sie}} versteht es, die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden zu erkennen und diese zu fördern. {{Er|Sie|Er/Sie}} ermöglicht auf die Funktion zugeschnittene Weiterbildungsmöglichkeiten und zeigt Entwicklungsperspektiven auf.';

-- mitarbeiterfoerderung / gut / Variante 2 / praeteritum
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} verstand es, die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden zu erkennen und diese zu fördern. {{Er|Sie|Er/Sie}} ermöglichte ihnen auf die Funktion zugeschnittene Weiterbildungen und zeigte Entwicklungsperspektiven auf.'
 where category = 'mitarbeiterfoerderung' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'gut' and variant = 2
   and tempus = 'praeteritum'
   and text = '{{Er|Sie|Er/Sie}} verstand es, die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden zu erkennen und diese zu fördern. {{Er|Sie|Er/Sie}} ermöglichte auf die Funktion zugeschnittene Weiterbildungsmöglichkeiten und zeigte Entwicklungsperspektiven auf.';

-- mitarbeiterfoerderung / sehr_gut / Variante 2 / praesens
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} erkennt die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden treffsicher und fördert diese gezielt. {{Er|Sie|Er/Sie}} ermöglicht ihnen auf die Funktion zugeschnittene Weiterbildungen und individuell interessante Entwicklungsperspektiven.'
 where category = 'mitarbeiterfoerderung' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'sehr_gut' and variant = 2
   and tempus = 'praesens'
   and text = '{{Er|Sie|Er/Sie}} versteht es gekonnt, die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden zu erkennen und diese entsprechend zu fördern. {{Er|Sie|Er/Sie}} ermöglicht auf die Funktion zugeschnittene Weiterbildungsmöglichkeiten und individuell interessante Entwicklungsperspektiven.';

-- mitarbeiterfoerderung / sehr_gut / Variante 2 / praeteritum
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} erkannte die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden treffsicher und förderte diese gezielt. {{Er|Sie|Er/Sie}} ermöglichte ihnen auf die Funktion zugeschnittene Weiterbildungen und individuell interessante Entwicklungsperspektiven.'
 where category = 'mitarbeiterfoerderung' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'sehr_gut' and variant = 2
   and tempus = 'praeteritum'
   and text = '{{Er|Sie|Er/Sie}} verstand es gekonnt, die Talente {{seiner|ihrer|seiner/ihrer}} Mitarbeitenden zu erkennen und diese entsprechend zu fördern. {{Er|Sie|Er/Sie}} ermöglichte auf die Funktion zugeschnittene Weiterbildungsmöglichkeiten und individuell interessante Entwicklungsperspektiven.';

-- teamfaehigkeit / gut / Variante 2 / praesens
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} bringt sich ins Team ein, ist integer und unterstützend. {{Er|Sie|Er/Sie}} trägt zu einer konstruktiven und positiven Zusammenarbeit bei und kann gut mit unterschiedlichen Personen und Situationen umgehen.'
 where category = 'teamfaehigkeit' and subcategory = 'persoenliches_verhalten'
   and employee_type = 'mitarbeiter' and rating = 'gut' and variant = 2
   and tempus = 'praesens'
   and text = '{{Er|Sie|Er/Sie}} bringt sich ins Team ein, ist integer und unterstützend. {{Er|Sie|Er/Sie}} trägt zu einer konstruktiven sowie positiven Zusammenarbeit bei und kann gut mit unterschiedlichen Personen und Situationen umgehen.';

-- teamfaehigkeit / gut / Variante 2 / praeteritum
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} brachte sich ins Team ein, war integer und unterstützend. {{Er|Sie|Er/Sie}} trug zu einer konstruktiven und positiven Zusammenarbeit bei und konnte gut mit unterschiedlichen Personen und Situationen umgehen.'
 where category = 'teamfaehigkeit' and subcategory = 'persoenliches_verhalten'
   and employee_type = 'mitarbeiter' and rating = 'gut' and variant = 2
   and tempus = 'praeteritum'
   and text = '{{Er|Sie|Er/Sie}} brachte sich ins Team ein, war integer und unterstützend. {{Er|Sie|Er/Sie}} trug zu einer konstruktiven sowie positiven Zusammenarbeit bei und konnte gut mit unterschiedlichen Personen und Situationen umgehen.';

-- teamfaehigkeit / sehr_gut / Variante 2 / praesens
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} bringt sich vorbildlich ins Team ein, ist integer und jederzeit unterstützend. {{Er|Sie|Er/Sie}} trägt aktiv zu einer konstruktiven und positiven Zusammenarbeit bei und kann sehr gut mit unterschiedlichen Personen und Situationen umgehen.'
 where category = 'teamfaehigkeit' and subcategory = 'persoenliches_verhalten'
   and employee_type = 'mitarbeiter' and rating = 'sehr_gut' and variant = 2
   and tempus = 'praesens'
   and text = '{{Er|Sie|Er/Sie}} bringt sich vorbildlich ins Team ein, ist integer und jederzeit unterstützend. {{Er|Sie|Er/Sie}} trägt aktiv zu einer konstruktiven sowie positiven Zusammenarbeit bei und kann sehr gut mit unterschiedlichen Personen und Situationen umgehen.';

-- teamfaehigkeit / sehr_gut / Variante 2 / praeteritum
update public.phrase_blocks set text = '{{Er|Sie|Er/Sie}} brachte sich vorbildlich ins Team ein, war integer und jederzeit unterstützend. {{Er|Sie|Er/Sie}} trug aktiv zu einer konstruktiven und positiven Zusammenarbeit bei und konnte sehr gut mit unterschiedlichen Personen und Situationen umgehen.'
 where category = 'teamfaehigkeit' and subcategory = 'persoenliches_verhalten'
   and employee_type = 'mitarbeiter' and rating = 'sehr_gut' and variant = 2
   and tempus = 'praeteritum'
   and text = '{{Er|Sie|Er/Sie}} brachte sich vorbildlich ins Team ein, war integer und jederzeit unterstützend. {{Er|Sie|Er/Sie}} trug aktiv zu einer konstruktiven sowie positiven Zusammenarbeit bei und konnte sehr gut mit unterschiedlichen Personen und Situationen umgehen.';

-- verantwortung_uebertragen / sehr_gut / Variante 1 / praesens
update public.phrase_blocks set text = 'Besonders hervorzuheben ist, dass {{er|sie|er/sie}} als {{Vorgesetzter|Vorgesetzte|Vorgesetzter/Vorgesetzte}} Aufgaben und Verantwortung vorbildlich und in angemessenem Umfang delegiert.'
 where category = 'verantwortung_uebertragen' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'sehr_gut' and variant = 1
   and tempus = 'praesens'
   and text = 'Wir schätzen enorm, dass {{er|sie|er/sie}} als {{engagierter|engagierte|engagierter/engagierte}} {{Vorgesetzter|Vorgesetzte|Vorgesetzter/Vorgesetzte}} Aufgaben und Verantwortung vorbildlich und in angemessenem Umfang delegiert.';

-- verantwortung_uebertragen / sehr_gut / Variante 1 / praeteritum
update public.phrase_blocks set text = 'Besonders hervorzuheben ist, dass {{er|sie|er/sie}} als {{Vorgesetzter|Vorgesetzte|Vorgesetzter/Vorgesetzte}} Aufgaben und Verantwortung vorbildlich und in angemessenem Umfang delegierte.'
 where category = 'verantwortung_uebertragen' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'sehr_gut' and variant = 1
   and tempus = 'praeteritum'
   and text = 'Wir schätzten enorm, dass {{er|sie|er/sie}} als {{engagierter|engagierte|engagierter/engagierte}} {{Vorgesetzter|Vorgesetzte|Vorgesetzter/Vorgesetzte}} Aufgaben und Verantwortung vorbildlich und in angemessenem Umfang delegierte.';

-- vorbild / genuegend / Variante 2 / praesens
update public.phrase_blocks set text = '{vorname} {nachname} erleben wir als motivierte Führungskraft, die verantwortungsvoll handelt. Entscheidungen trifft {{er|sie|er/sie}} durchdacht und kommuniziert diese klar und nachvollziehbar.'
 where category = 'vorbild' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'genuegend' and variant = 2
   and tempus = 'praesens'
   and text = '{vorname} {nachname} erleben wir als motivierte Führungskraft, die verantwortungsvoll handelt. Entscheidungen trifft {{er|sie|er/sie}} durchdacht, kommuniziert diese klar und nachvollziehbar.';

-- vorbild / genuegend / Variante 2 / praeteritum
update public.phrase_blocks set text = '{vorname} {nachname} erlebten wir als motivierte Führungskraft, die verantwortungsvoll handelte. Entscheidungen traf {{er|sie|er/sie}} durchdacht und kommunizierte diese klar und nachvollziehbar.'
 where category = 'vorbild' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'genuegend' and variant = 2
   and tempus = 'praeteritum'
   and text = '{vorname} {nachname} erlebten wir als motivierte Führungskraft, die verantwortungsvoll handelte. Entscheidungen traf {{er|sie|er/sie}} durchdacht, kommunizierte diese klar und nachvollziehbar.';

-- vorbild / gut / Variante 2 / praesens
update public.phrase_blocks set text = '{vorname} {nachname} schätzen wir als engagierte und integre Führungskraft, die vorausschauend, ziel- und umsetzungsorientiert sowie im Sinne unserer Wertekultur handelt. {{Er|Sie|Er/Sie}} ist selbstdiszipliniert und übernimmt stets Verantwortung. Entscheidungen trifft {{er|sie|er/sie}} gut durchdacht und kommuniziert diese zeitgerecht, klar und nachvollziehbar. Zudem überzeugt {{er|sie|er/sie}} durch {{seinen|ihren|seinen/ihren}} kooperativen Führungsstil.'
 where category = 'vorbild' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'gut' and variant = 2
   and tempus = 'praesens'
   and text = '{vorname} {nachname} schätzen wir als engagierte und integre Führungskraft, die vorausschauend, ziel- und umsetzungsorientiert sowie im Sinne unserer Wertekultur handelt. {{Er|Sie|Er/Sie}} verfügt über Selbstdisziplin und übernimmt stets Verantwortung. Entscheidungen trifft {{er|sie|er/sie}} gut durchdacht, kommuniziert diese zeitgerecht, klar und nachvollziehbar. Zudem überzeugt {{er|sie|er/sie}} durch {{seinen|ihren|seinen/ihren}} kooperativen Führungsstil.';

-- vorbild / gut / Variante 2 / praeteritum
update public.phrase_blocks set text = '{vorname} {nachname} schätzten wir als engagierte und integre Führungskraft, die vorausschauend, ziel- und umsetzungsorientiert sowie im Sinne unserer Wertekultur handelte. {{Er|Sie|Er/Sie}} war selbstdiszipliniert und übernahm stets Verantwortung. Entscheidungen traf {{er|sie|er/sie}} gut durchdacht und kommunizierte diese zeitgerecht, klar und nachvollziehbar. Zudem überzeugte {{er|sie|er/sie}} durch {{seinen|ihren|seinen/ihren}} kooperativen Führungsstil.'
 where category = 'vorbild' and subcategory = 'fuehrung'
   and employee_type = 'fuehrungskraft' and rating = 'gut' and variant = 2
   and tempus = 'praeteritum'
   and text = '{vorname} {nachname} schätzten wir als engagierte und integre Führungskraft, die vorausschauend, ziel- und umsetzungsorientiert sowie im Sinne unserer Wertekultur handelte. {{Er|Sie|Er/Sie}} verfügte über Selbstdisziplin und übernahm stets Verantwortung. Entscheidungen traf {{er|sie|er/sie}} gut durchdacht, kommunizierte diese zeitgerecht, klar und nachvollziehbar. Zudem überzeugte {{er|sie|er/sie}} durch {{seinen|ihren|seinen/ihren}} kooperativen Führungsstil.';

commit;
