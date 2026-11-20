<script lang="ts">
  import type { Level } from "@ojolink/core";

  let { level }: { level: Level } = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
  data-icon={level}
>
  {#if level === "danger"}
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9.5 9.5 5 5m0-5-5 5" />
  {:else if level === "caution"}
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4m0 4h.01" />
  {:else if level === "hidden-destination"}
    <path
      d="M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2"
    />
    <path d="M1 1l22 22" />
  {:else}
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 3 3 5-6" />
  {/if}
</svg>

<style>
  .icon {
    width: 1.15em;
    height: 1.15em;
    flex: none;
  }
</style>
