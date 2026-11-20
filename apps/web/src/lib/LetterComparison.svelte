<script lang="ts">
  import type { Comparison } from "@ojolink/core";

  let {
    comparison,
    label,
    substituted,
  }: { comparison: Comparison; label: string; substituted: string } = $props();
</script>

<div class="comparison">
  <p class="label">{label}</p>
  <ol class="tiles" aria-label={label}>
    {#each comparison.units as unit, index (index)}
      <li class="tile" class:marked={unit.marked}>
        <span class="char" aria-hidden="true">{unit.char}</span>
        <span class="alphabet" aria-hidden="true">{unit.alphabet}</span>
        <span class="sr-only">
          {[unit.char, unit.alphabet, unit.marked ? substituted : ""].filter(Boolean).join(", ")}
        </span>
      </li>
    {/each}
    {#if comparison.rest}
      <li class="rest">{comparison.rest}</li>
    {/if}
  </ol>
</div>

<style>
  .label {
    margin: 0 0 0.4rem;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .tiles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3.4rem;
    padding: 0.35rem 0.4rem 0.3rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .tile.marked {
    border: 2px solid var(--danger-fg);
    background: var(--danger-tint);
    color: var(--danger-fg);
  }
  .char {
    font-family: var(--font-mono);
    font-size: 1.5rem;
    line-height: 1.2;
  }
  .alphabet {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    min-height: 1em;
  }
  .rest {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    overflow-wrap: anywhere;
  }
</style>
