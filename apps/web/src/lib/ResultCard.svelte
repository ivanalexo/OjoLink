<script lang="ts">
  import type { CheckedLink } from "./check";
  import LetterComparison from "./LetterComparison.svelte";
  import LevelBadge from "./LevelBadge.svelte";
  import LevelIcon from "./LevelIcon.svelte";
  import { fill, strings } from "./strings";

  let { item }: { item: CheckedLink } = $props();
  const description = $derived(item.description);
  const labels = $derived(item.description.labels);
</script>

<article class="card" data-level={description.level}>
  <header class="head">
    <LevelBadge level={description.level} label={description.levelLabel} />
    <p class="link">
      <span class="sr-only">{strings.linkLabel}:</span>
      <code>{item.display}</code>
    </p>
  </header>

  {#if description.warning}
    <div class="title">
      <span class="title-icon"><LevelIcon level={description.level} /></span>
      <h3>{description.warning.title}</h3>
    </div>
    <p class="explanation">{description.warning.explanation}</p>
    {#if description.warning.comparison}
      <LetterComparison
        comparison={description.warning.comparison}
        label={labels.comparison}
        substituted={labels.substituted}
      />
    {/if}
  {:else}
    <p class="explanation">{description.levelDescription}</p>
  {/if}

  {#if description.realAddress}
    <p class="real">{labels.realAddress}: <code>{description.realAddress}</code></p>
  {/if}

  {#if description.warning}
    <p class="advice">{description.warning.advice}</p>
    <details class="technical">
      <summary>{labels.technical}</summary>
      <ul>
        {#each description.technical.signals as signal (signal.id)}
          <li>
            <code>{signal.id}</code>
            <span class="weight">({fill(strings.weight, { weight: signal.weight })})</span>
            <span class="text">{signal.text}</span>
          </li>
        {/each}
      </ul>
      <p>{labels.score}: {description.technical.score}</p>
      {#if description.technical.notEvaluated.length > 0}
        <p>{labels.notEvaluated}: {description.technical.notEvaluated.join(", ")}</p>
      {/if}
    </details>
  {/if}
</article>

<style>
  .card {
    display: grid;
    gap: 0.85rem;
    padding: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    min-width: 0;
  }
  .link {
    margin: 0;
    min-width: 0;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .title-icon {
    display: grid;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    flex: none;
    border-radius: 50%;
    font-size: 1.1rem;
  }
  .card[data-level="danger"] .title-icon {
    color: var(--danger-fg);
    background: var(--danger-tint);
  }
  .card[data-level="caution"] .title-icon {
    color: var(--caution-fg);
    background: var(--caution-tint);
  }
  .card[data-level="hidden-destination"] .title-icon {
    color: var(--hidden-fg);
    background: var(--hidden-tint);
  }
  .card[data-level="safe"] .title-icon {
    color: var(--safe-fg);
    background: var(--safe-tint);
  }
  h3 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .explanation,
  .real,
  .advice {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .real {
    color: var(--muted);
  }
  .real code {
    color: var(--ink);
  }
  .advice {
    padding: 0.75rem 0.9rem;
    border-radius: 10px;
    background: var(--bg);
  }
  .technical {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .technical summary {
    cursor: pointer;
    width: fit-content;
    padding: 0.15rem 0.25rem;
    border-radius: 6px;
  }
  .technical ul {
    margin: 0.6rem 0;
    padding-left: 1.1rem;
  }
  .technical li {
    margin-bottom: 0.4rem;
    overflow-wrap: anywhere;
  }
  .technical p {
    margin: 0.3rem 0 0;
  }
  .text {
    display: block;
  }
</style>
