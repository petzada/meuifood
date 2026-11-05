// Som de Pedido novo (PED-05) sem arquivo de áudio: dois tons curtos pelo Web Audio. O
// navegador só libera áudio depois de um gesto: `unlock()` roda no clique da faixa e, se o
// contexto ficar "running", o som passa a tocar nos pollings seguintes.
export type QueueSound = {
  /** Tenta liberar o áudio num gesto do usuário; true se ficou pronto. */
  unlock(): Promise<boolean>;
  play(): void;
  readonly ready: boolean;
};

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createQueueSound(): QueueSound {
  let context: AudioContext | null = null;
  const sound: QueueSound = {
    get ready() {
      return context?.state === "running";
    },
    async unlock() {
      const Ctor = audioContextCtor();
      if (!Ctor) return false;
      context ??= new Ctor();
      if (context.state !== "running") {
        try {
          await context.resume();
        } catch {
          return false;
        }
      }
      return context.state === "running";
    },
    play() {
      if (!context || context.state !== "running") return;
      const at = context.currentTime;
      for (const [offset, frequency] of [
        [0, 880],
        [0.18, 1175],
      ] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at + offset);
        gain.gain.exponentialRampToValueAtTime(0.4, at + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.16);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at + offset);
        oscillator.stop(at + offset + 0.18);
      }
    },
  };
  return sound;
}
