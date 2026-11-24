<script lang="ts">
  import { strings } from "./strings";

  let { address, shortcut }: { address: string; shortcut: string | null } = $props();
</script>

<section class="guide" aria-labelledby="ios-title">
  <h2 id="ios-title">{strings.iosTitle}</h2>
  <p>{strings.iosIntro}</p>

  {#if shortcut}
    <p><a class="ready" href={shortcut} rel="noopener noreferrer">{strings.iosReady}</a></p>
  {/if}

  <h3>{strings.iosManual}</h3>
  <ol>
    {#each strings.iosSteps as step (step)}
      <li>{step}</li>
    {/each}
  </ol>
  <p class="address">{strings.iosAddress}: <code>{address}#u=</code></p>
  <p>{strings.iosUse}</p>
  <p><a href="#inicio">{strings.iosBack}</a></p>
</section>

<style>
  .guide {
    display: grid;
    gap: 0.75rem;
    padding: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    min-width: 0;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-size: 1.3rem;
  }
  h3 {
    font-size: 1.05rem;
  }
  ol {
    margin: 0;
    padding-left: 1.3rem;
    display: grid;
    gap: 0.5rem;
  }
  .address {
    overflow-wrap: anywhere;
  }
  a {
    color: var(--accent);
  }
</style>
