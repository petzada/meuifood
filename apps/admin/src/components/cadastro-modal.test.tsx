// Componente (decisão 74): padrão de cadastro em modal — etapas com indicador, Voltar sem perder
// dados, Pular nas opcionais, Esc/X/fundo com aviso de mudança não salva, foco preso e devolvido,
// sheet inferior abaixo de 768 px e abas acessíveis na edição.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "../test/render";
import {
  CadastroFooter,
  CadastroModal,
  CadastroTabs,
  StepIndicator,
  StepNavButton,
  StepPanel,
  useSteps,
  type CadastroStep,
} from "./cadastro-modal";

const STEPS: CadastroStep[] = [
  { id: "dados", label: "Dados" },
  { id: "extras", label: "Extras", optional: true },
  { id: "fim", label: "Fim", optional: true },
];

function Wizard({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const steps = useSteps(STEPS);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir cadastro
      </button>
      <CadastroModal
        open={open}
        title="Novo teste"
        dirty={name !== ""}
        onClose={() => setOpen(false)}
        toolbar={<StepIndicator current={steps.current} steps={STEPS} />}
      >
        <StepPanel active={steps.current === 0} label="Dados">
          <label htmlFor="nome">Nome</label>
          <input id="nome" value={name} onChange={(event) => setName(event.target.value)} />
          <CadastroFooter>
            <StepNavButton variant="primary" onClick={steps.next}>
              Continuar
            </StepNavButton>
          </CadastroFooter>
        </StepPanel>
        {STEPS.slice(1).map((step, offset) => {
          const last = offset === STEPS.length - 2;
          return (
            <StepPanel key={step.id} active={steps.current === offset + 1} label={step.label}>
              <p>Conteúdo de {step.label}</p>
              <CadastroFooter>
                <StepNavButton onClick={steps.back}>Voltar</StepNavButton>
                <StepNavButton variant="text" onClick={last ? onDone : steps.next}>
                  Pular
                </StepNavButton>
              </CadastroFooter>
            </StepPanel>
          );
        })}
      </CadastroModal>
    </>
  );
}

function mockViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mobile && query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CadastroModal", () => {
  it("abre como modal central no desktop, com título acessível e foco dentro", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    render(<Wizard onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Abrir cadastro" }));

    const dialog = screen.getByRole("dialog", { name: "Novo teste" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTestId("cadastro-modal-root")).toHaveAttribute("data-variant", "dialog");
    await vi.waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  });

  it("no celular (< 768 px) vira sheet inferior", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    render(<Wizard onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Abrir cadastro" }));
    expect(screen.getByTestId("cadastro-modal-root")).toHaveAttribute("data-variant", "sheet");
  });

  it("etapas: indicador marca a atual, Voltar mantém o digitado e Pular avança/conclui", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<Wizard onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: "Abrir cadastro" }));

    const steps = screen.getByRole("navigation", { name: "Etapas do cadastro" });
    expect(within(steps).getByText("Dados").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await user.type(screen.getByLabelText("Nome"), "Misto");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("region", { name: "Etapa: Extras" })).toBeVisible();
    expect(within(steps).getByText("Extras").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(within(steps).getAllByText("(opcional)")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Nome")).toHaveValue("Misto");

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(screen.getByRole("region", { name: "Etapa: Fim" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Esc sem mudança fecha e devolve o foco a quem abriu", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    render(<Wizard onDone={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Abrir cadastro" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("Esc com mudança pergunta antes de descartar; Continuar editando mantém tudo", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    render(<Wizard onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Abrir cadastro" }));
    await user.type(screen.getByLabelText("Nome"), "Misto");

    await user.keyboard("{Escape}");
    const confirm = screen.getByRole("alertdialog", { name: "Descartar as alterações?" });
    await user.click(within(confirm).getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByLabelText("Nome")).toHaveValue("Misto");

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clique no fundo também pede para fechar", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    render(<Wizard onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Abrir cadastro" }));
    await user.click(screen.getByTestId("cadastro-modal-fundo"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Tab fica preso dentro do modal", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    render(<Wizard onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Abrir cadastro" }));
    const dialog = screen.getByRole("dialog", { name: "Novo teste" });
    screen.getByRole("button", { name: "Continuar" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});

describe("CadastroTabs", () => {
  it("abas com setas e painéis montados (nada se perde ao trocar)", async () => {
    const user = userEvent.setup();
    render(
      <CadastroTabs
        label="Seções"
        tabs={[
          {
            id: "a",
            label: "Dados",
            content: (
              <>
                <label htmlFor="campo">Campo</label>
                <input id="campo" />
              </>
            ),
          },
          { id: "b", label: "Complementos", content: <p>Grupos</p> },
        ]}
      />,
    );
    await user.type(screen.getByLabelText("Campo"), "abc");
    const first = screen.getByRole("tab", { name: "Dados" });
    expect(first).toHaveAttribute("aria-selected", "true");
    first.focus();
    await user.keyboard("{ArrowRight}");
    const second = screen.getByRole("tab", { name: "Complementos" });
    expect(second).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Complementos" })).toHaveTextContent("Grupos");
    await user.click(first);
    expect(screen.getByLabelText("Campo")).toHaveValue("abc");
  });
});
