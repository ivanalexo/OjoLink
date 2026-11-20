<script lang="ts">
  import type { Level } from "@ojolink/core";
  import LevelIcon from "./LevelIcon.svelte";

  let { level, label }: { level: Level; label: string } = $props();
</script>

<span class="badge" data-level={level}>
  <LevelIcon {level} />
  <span>{label}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    border: 1px solid currentColor;
    font-weight: 600;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .badge[data-level="danger"] {
    color: var(--danger-fg);
    background: var(--danger-tint);
  }
  .badge[data-level="caution"] {
    color: var(--caution-fg);
    background: var(--caution-tint);
  }
  .badge[data-level="hidden-destination"] {
    color: var(--hidden-fg);
    background: var(--hidden-tint);
  }
  .badge[data-level="safe"] {
    color: var(--safe-fg);
    background: var(--safe-tint);
  }
</style>
