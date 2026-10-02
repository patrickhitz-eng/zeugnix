-- ============================================================================
-- zeugnix.ch – Schreibregeln für manager_invitations (Migration 026)
-- ----------------------------------------------------------------------------
-- WARUM DIESE DATEI EXISTIERT
--
-- Diese zwei Regeln standen in der Produktionsdatenbank, aber in keiner Migration.
-- Gefunden am 2026-10-02 mit supabase/904_prod_inventar.sql: 22 Regeln in der
-- Produktion, 20 in den Migrationen. Jemand hat sie im Dashboard angelegt, um ein
-- Problem im Betrieb zu lösen, und es nicht zurück ins Repository geschrieben.
--
-- Das Schema für den eigenen Server entsteht aus den Migrationen. Was hier nicht
-- steht, fehlt dort – und bei einer Zeilensicherheitsregel ist das kein Fehler,
-- sondern Stille: die Datenbank antwortet nicht mit einer Meldung, sondern mit
-- nichts. Darum wird jede Abweichung nachgetragen, bevor umgezogen wird.
--
-- WAS SIE TATSÄCHLICH BEWIRKEN: NICHTS
--
-- Das ist kein Widerspruch, sondern das Ergebnis des Vergleichs. Auf derselben
-- Tabelle liegt aus 001 bereits:
--
--   create policy "Members can manage invitations" ... for all using (<derselbe Ausdruck>)
--
-- Bei `for all` mit nur `using` und ohne `with check` verwendet PostgreSQL den
-- using-Ausdruck auch als Prüfung für neue und geänderte Zeilen. Und mehrere
-- erlaubende Regeln für denselben Befehl werden mit ODER verknüpft, nicht mit UND.
-- Die beiden Regeln hier tragen wörtlich denselben Ausdruck wie die Regel aus 001,
-- nur auf einen Befehl eingeschränkt. Sie erlauben also nichts, was nicht schon
-- erlaubt war, und sie verbieten nichts.
--
-- Vermutlich entstanden sie bei der Fehlersuche zu 004_evaluations_write_policy.sql.
-- Dort war das Problem echt – `evaluations` hatte in 001 nur eine Leseregel, und das
-- Schreiben scheiterte mit „new row violates row-level security policy". Bei
-- manager_invitations lag eine `for all`-Regel vor; die zusätzlichen Regeln waren
-- Vorsichtsmaßnahme, nicht Behebung.
--
-- WARUM SIE TROTZDEM NACHGETRAGEN WERDEN
--
-- Nicht weil sie nötig sind, sondern damit die neue Datenbank mit der Produktion
-- übereinstimmt. Am Umzugstag wird verglichen, und eine Abweichung „zwei Regeln
-- fehlen" müsste dann unter Zeitdruck beurteilt werden – mit genau der Überlegung,
-- die hier in Ruhe schon angestellt wurde. Der Nachtrag kostet nichts; die
-- Beurteilung am falschen Moment kostet Vertrauen in den Vergleich.
--
-- Wer sie für überflüssig hält, hat recht und darf sie löschen – aber dann bitte
-- zusammen mit dieser Begründung, damit der nächste Vergleich nicht wieder stutzt.
--
-- Idempotent: `drop policy if exists` vor jedem `create`. Absichtlich ohne
-- begin/commit – scripts/migrate.mjs legt die Transaktion darum. Beim Ausführen von
-- Hand im SQL-Editor selbst eine setzen, damit die Regel nicht kurz ganz fehlt.
--
-- Ausführung auf dem eigenen Server: node scripts/migrate.mjs
-- Ausführung in der Produktion:      Supabase Dashboard → SQL Editor → Run
--   (dort ändert sie nichts – die Regeln werden mit demselben Inhalt neu angelegt.
--    Sinn ist allein, dass Repository und Produktion danach dasselbe sagen.)
-- ============================================================================

-- INSERT: wer Zugriff auf das Zeugnis hat, darf eine Einladung dazu anlegen.
drop policy if exists "Members can insert invitations" on public.manager_invitations;
create policy "Members can insert invitations" on public.manager_invitations
  for insert with check (
    exists (
      select 1 from public.certificates cert
      join public.companies c on c.id = cert.company_id
      where cert.id = manager_invitations.certificate_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );

-- UPDATE: dieselbe Bedingung. Ohne `with check` gilt der using-Ausdruck auch für die
-- geänderte Zeile – ein Mitglied kann eine Einladung also nicht auf ein Zeugnis
-- umhängen, zu dem es keinen Zugriff hat.
drop policy if exists "Members can update invitations" on public.manager_invitations;
create policy "Members can update invitations" on public.manager_invitations
  for update using (
    exists (
      select 1 from public.certificates cert
      join public.companies c on c.id = cert.company_id
      where cert.id = manager_invitations.certificate_id
      and (
        c.created_by_user_id = auth.uid()
        or exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
      )
    )
  );
