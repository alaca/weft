import { For, Show, type JSX } from "solid-js";

const LENGTHS = [1, 2, 4];

export function GridFooter(props: {
  cycles: number;
  perCycle: number;
  resolutions: number[];
  canUse: (resolution: number) => boolean;
  shown: number;
  disabled: boolean;
  onPage: (index: number) => void;
  onLength: (cycles: number) => void;
  onSteps: (perCycle: number) => void;
  children?: JSX.Element;
}) {
  const blocked = (resolution: number) =>
    resolution !== props.perCycle && !props.canUse(resolution);
  return (
    <>
      <div class="rk-f">
        {props.children}
        <span class="cap">Length</span>
        <div class="seg s">
          <For each={LENGTHS}>
            {(length) => (
              <button
                classList={{ on: props.cycles === length }}
                aria-label={`Length ${length} cycles`}
                aria-pressed={props.cycles === length}
                disabled={props.disabled}
                onClick={() => props.onLength(length)}
              >
                {length}
              </button>
            )}
          </For>
        </div>
        <span class="cap">Steps</span>
        <div class="seg s">
          <For each={props.resolutions}>
            {(resolution) => (
              <button
                classList={{ on: props.perCycle === resolution }}
                aria-label={`${resolution} steps a cycle`}
                aria-pressed={props.perCycle === resolution}
                disabled={props.disabled || blocked(resolution)}
                title={
                  blocked(resolution)
                    ? "Something sits between these steps. Move or remove it first."
                    : undefined
                }
                onClick={() => props.onSteps(resolution)}
              >
                {resolution}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={props.cycles > 1}>
        <div class="rk-f rk-c">
          <span class="cap">Cycle</span>
          <div class="seg s">
            <For each={Array.from({ length: props.cycles }, (_, i) => i)}>
              {(index) => (
                <button
                  classList={{ on: props.shown === index }}
                  aria-label={`Cycle ${index + 1}`}
                  aria-pressed={props.shown === index}
                  onClick={() => props.onPage(index)}
                >
                  {index + 1}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
}
