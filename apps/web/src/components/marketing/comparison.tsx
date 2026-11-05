// Comparativo (decisão 70 + Dono 2026-11-05): cabeçalhos em chips (Foode preenchido em
// primary-strong com texto branco, AA; as outras só contorno na cor da marca); a borda da
// coluna Foode começa na 1ª linha de dados e vai até o fim; uma coisa por linha. Dados e fontes em
// `content/competitors.ts`; dado não verificado aparece como "—".
import { COMPARISON_ROWS, COMPETITORS } from "../../content/competitors";

export function Comparison() {
  const latest = COMPETITORS.map((c) => c.readAt)
    .sort()
    .at(-1);
  return (
    <div className="grid gap-4" data-reveal>
      <div className="mk-compare-wrap foode-outline p-2 md:p-4">
        <table className="mk-compare">
          <caption className="sr-only">
            Comparativo de condições comerciais entre a Foode e duas outras plataformas
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Critério</span>
              </th>
              <th className="is-foode-head" scope="col">
                <span className="mk-compare__brand mk-compare__brand--foode">Foode</span>
              </th>
              {COMPETITORS.map((competitor) => (
                <th key={competitor.key} className="is-other" scope="col">
                  <span className="mk-compare__brand" style={{ color: competitor.brandColor }}>
                    Outra plataforma
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, index) => (
              <tr key={row.label} className={index === 0 ? "is-first" : ""}>
                <th className="font-bold text-[var(--color-body)]" scope="row">
                  {row.label}
                </th>
                <td className="is-foode">{row.foode}</td>
                {row.others.map((value, i) => (
                  <td key={COMPETITORS[i]?.key ?? i} className="is-other">
                    {value ?? <span aria-label="não informado publicamente">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-muted)]">
        Dados públicos das páginas de planos das outras plataformas, lidos em {latest}; “—” é o que
        a plataforma não publica. A Foode não cita nomes: compare você mesmo.
      </p>
    </div>
  );
}
