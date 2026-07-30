import { cn } from "@/lib/cn";

/**
 * El croquis.
 *
 * Nicaraguan addresses are given as directions from a landmark, not as a
 * street number — "de la Iglesia Católica, 75 metros al sur, frente al CSE".
 * A pin dropped on a satellite map answers a question nobody here asks, so
 * this draws the address the way it is actually spoken.
 *
 * Inline SVG: no tiles to download, no third-party request, works offline,
 * and it scales cleanly on a 360px screen.
 */
export function Croquis({ className }: { className?: string }) {
  return (
    <figure className={cn("rounded-lg border border-rule bg-paper p-4", className)}>
      <svg
        viewBox="0 0 320 360"
        className="h-auto w-full"
        role="img"
        aria-labelledby="croquis-titulo croquis-desc"
      >
        <title id="croquis-titulo">
          Croquis de ubicación de Alquifiestas y Eventos
        </title>
        <desc id="croquis-desc">
          Desde la Iglesia Católica de San Marcos, 75 metros hacia el sur.
          Alquifiestas y Eventos queda sobre la calle, frente al CSE.
        </desc>

        {/* The street */}
        <rect x="118" y="0" width="84" height="360" fill="#d2d7ca" />
        <line
          x1="160"
          y1="0"
          x2="160"
          y2="360"
          stroke="#f4f6f1"
          strokeWidth="3"
          strokeDasharray="14 12"
        />

        {/* Iglesia Católica — on the right side of the street */}
        <g>
          <rect x="214" y="26" width="76" height="54" rx="4" fill="#186b57" />
          <path d="M252 8 L270 26 H234 Z" fill="#186b57" />
          <path d="M252 12 v10 M247 17 h10" stroke="#f4f6f1" strokeWidth="3" />
          <text
            x="290"
            y="98"
            fill="#12312b"
            fontSize="13"
            fontWeight="600"
            textAnchor="end"
            fontFamily="var(--font-sans)"
          >
            Iglesia Católica
          </text>
        </g>

        {/* Parque Central — across the street, in front of the church */}
        <g>
          <rect x="30" y="26" width="76" height="54" rx="4" fill="#cfe0cb" />
          <circle cx="52" cy="46" r="10" fill="#5f9a63" />
          <circle cx="84" cy="58" r="12" fill="#4e8a55" />
          <rect x="66" y="42" width="4" height="26" rx="2" fill="#8a6f4d" />
          <text
            x="30"
            y="98"
            fill="#12312b"
            fontSize="13"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            Parque Central
          </text>
        </g>

        {/* 75 metros south */}
        <g>
          <line
            x1="160"
            y1="96"
            x2="160"
            y2="196"
            stroke="#c7401f"
            strokeWidth="3"
          />
          <path d="M160 202 l-7 -12 h14 Z" fill="#c7401f" />
          <rect x="126" y="132" width="68" height="26" rx="13" fill="#c7401f" />
          <text
            x="160"
            y="150"
            fill="#ffffff"
            fontSize="13"
            fontWeight="700"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            75 m
          </text>
          <text
            x="212"
            y="126"
            fill="#555c4f"
            fontSize="12"
            fontFamily="var(--font-mono)"
          >
            al sur
          </text>
        </g>

        {/* Us — on the right side of the street */}
        <g>
          <rect x="208" y="212" width="88" height="64" rx="4" fill="#12312b" />
          <rect x="220" y="228" width="64" height="4" rx="2" fill="#e8ebe4" />
          <rect x="220" y="240" width="44" height="4" rx="2" fill="#8fa79e" />
          <circle cx="216" cy="244" r="7" fill="#c7401f" />
          <text
            x="296"
            y="294"
            fill="#12312b"
            fontSize="13"
            fontWeight="700"
            textAnchor="end"
            fontFamily="var(--font-sans)"
          >
            Alquifiestas
          </text>
          <text
            x="296"
            y="310"
            fill="#555c4f"
            fontSize="12"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            y eventos
          </text>
        </g>

        {/* CSE, across the street */}
        <g>
          <rect x="28" y="212" width="84" height="64" rx="4" fill="#a8ac9e" />
          <rect x="42" y="230" width="56" height="28" rx="2" fill="#f4f6f1" />
          <text
            x="28"
            y="294"
            fill="#12312b"
            fontSize="13"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            CSE
          </text>
          <text
            x="28"
            y="310"
            fill="#555c4f"
            fontSize="12"
            fontFamily="var(--font-mono)"
          >
            al frente
          </text>
        </g>

        {/* Compass — the address is given by cardinal direction, so it matters */}
        <g transform="translate(286, 36)">
          <circle r="18" fill="#e8ebe4" stroke="#d2d7ca" />
          <path d="M0 -11 L5 3 L0 0 L-5 3 Z" fill="#12312b" />
          <text
            y="-13"
            fill="#555c4f"
            fontSize="10"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            N
          </text>
        </g>
      </svg>

      <figcaption className="type-mono mt-3 text-xs text-stone-text">
        De la Iglesia Católica, 75 metros al sur. Estamos frente al CSE.
      </figcaption>
    </figure>
  );
}
