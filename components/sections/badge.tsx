export function BadgeSection() {
  return (
    <section className="border-b border-ink-200 bg-ink-50/50 py-24">
      <div className="container-zx">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-20">
          {/* Siegel-Visual */}
          <div className="flex justify-center lg:col-span-5">
            <div className="relative">
              {/* Outer Ring */}
              <svg
                viewBox="0 0 240 240"
                className="h-[280px] w-[280px]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <path
                    id="circlePath"
                    d="M 120,120 m -100,0 a 100,100 0 1,1 200,0 a 100,100 0 1,1 -200,0"
                  />
                </defs>

                {/* Doppelring */}
                <circle
                  cx="120"
                  cy="120"
                  r="115"
                  fill="none"
                  stroke="#0F2038"
                  strokeWidth="0.5"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="105"
                  fill="#0F2038"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="100"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity="0.18"
                  strokeWidth="0.5"
                />

                {/* Text auf Pfad */}
                <text
                  fill="#FFFFFF"
                  fontFamily="Inter Tight, sans-serif"
                  fontSize="9"
                  fontWeight="500"
                  letterSpacing="3"
                >
                  <textPath href="#circlePath" startOffset="3%">
                    VERIFIED CERTIFICATE EMPLOYER · GEPRÜFTER ZEUGNISSTANDARD ·
                  </textPath>
                </text>

                {/* Sterne als Trenner */}
                <circle cx="120" cy="20" r="1.4" fill="#5AAFA3" />
                <circle cx="120" cy="220" r="1.4" fill="#5AAFA3" />

                {/* Innerer Bereich */}
                <circle
                  cx="120"
                  cy="120"
                  r="78"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity="0.15"
                  strokeWidth="0.5"
                />

                {/* Schild im Zentrum */}
                <path
                  d="M120 78 L150 90 L150 120 C150 135 138 148 120 154 C102 148 90 135 90 120 L90 90 Z"
                  fill="none"
                  stroke="#5AAFA3"
                  strokeWidth="1.2"
                />

                {/* Häkchen */}
                <path
                  d="M105 117 L115 127 L135 107"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Untertext */}
                <text
                  x="120"
                  y="172"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontFamily="Inter Tight, sans-serif"
                  fontSize="6.5"
                  fontWeight="500"
                  letterSpacing="2"
                >
                  zeugnix.ch
                </text>
              </svg>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="eyebrow">Das Arbeitgeber-Siegel</div>
            <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
              Geprüfter Zeugnisstandard.
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-600">
              Unternehmen, die mindestens ein finales Arbeitszeugnis über
              zeugnix.ch erstellt haben, dürfen das Siegel
              <em className="font-display"> Verified Certificate Employer </em>
              führen – als sichtbares Zeichen für einen standardisierten,
              überprüfbaren HR-Prozess.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                {
                  title: "Compliance sichtbar machen",
                  body: "Strukturierter Prozess statt individuell formulierter Einzelstücke.",
                },
                {
                  title: "Vertrauen bei Bewerbern",
                  body: "Kandidatinnen und Kandidaten erkennen seriöse Arbeitgeber.",
                },
                {
                  title: "Differenzierung im Recruiting",
                  body: "Professionalität bereits im Stelleninserat positioniert.",
                },
              ].map((b) => (
                <li
                  key={b.title}
                  className="flex items-start gap-3 border-l border-petrol-600 pl-4"
                >
                  <div>
                    <div className="text-[14.5px] font-medium tracking-tight text-ink-900">
                      {b.title}
                    </div>
                    <div className="mt-1 text-[13.5px] leading-relaxed text-ink-600">
                      {b.body}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
