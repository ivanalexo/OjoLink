<script lang="ts">
  import { describeLevel, describeReveal } from "@ojolink/core";
  import type { CheckedLink } from "./check";
  import LetterComparison from "./LetterComparison.svelte";
  import LevelBadge from "./LevelBadge.svelte";
  import LevelIcon from "./LevelIcon.svelte";
  import type { FailureReason } from "./reveal";
  import type { RevealState } from "./reveals";
  import { fill, strings } from "./strings";

  let {
    item,
    stage = null,
    policy = null,
    onreveal,
  }: {
    item: CheckedLink;
    stage?: RevealState | null;
    policy?: string | null;
    onreveal?: (deep: boolean) => void;
  } = $props();

  const reveal = describeReveal();
  const caution = describeLevel("caution");
  const reasons: Record<FailureReason, string> = {
    unresolved: reveal.failedUnresolved,
    offline: reveal.failedOffline,
    limited: reveal.failedLimited,
    "deep-unavailable": reveal.failedDeepUnavailable,
    error: reveal.failedError,
  };

  const failed = $derived(stage?.kind === "failed" ? stage : null);
  const description = $derived(stage?.kind === "revealed" ? stage.description : item.description);
  const labels = $derived(description.labels);
  const level = $derived(failed ? "caution" : description.level);
  const levelLabel = $derived(failed ? caution.label : description.levelLabel);
  const sent = $derived(
    stage?.kind === "revealed" || (failed !== null && failed.reason !== "offline"),
  );
</script>

<article class="card" data-level={level}>
  <header class="head">
    <LevelBadge {level} label={levelLabel} />
    <p class="link">
      <span class="sr-only">{strings.linkLabel}:</span>
      <code>{item.display}</code>
    </p>
  </header>

  {#if failed}
    <div class="title">
      <span class="title-icon"><LevelIcon level="caution" /></span>
      <h3>{reveal.failedTitle}</h3>
    </div>
    <p class="explanation">{reasons[failed.reason]}</p>
    <p class="advice">{reveal.failedAdvice}</p>
    <div class="actions">
      <button type="button" onclick={() => onreveal?.(false)}>{reveal.retryButton}</button>
      {#if failed.deepOffered}
        <button type="button" class="secondary" onclick={() => onreveal?.(true)}>
          {reveal.deepButton}
        </button>
      {/if}
    </div>
  {:else}
    {#if stage?.kind === "revealed"}
      <p class="real">{reveal.leadsTo}: <code>{stage.display}</code></p>
      <p class="via">{reveal.viaShortener}</p>
    {/if}

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
      <p class="explanation">
        {stage?.kind === "revealed" ? reveal.safeDestination : description.levelDescription}
      </p>
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
    {#if stage?.kind === "waiting"}
      <p class="progress">{stage.deep ? reveal.waitingDeep : reveal.waiting}</p>
    {:else if stage?.kind === "manual"}
      <p class="via">{reveal.manual}</p>
      <div class="actions">
        <button type="button" onclick={() => onreveal?.(false)}>{reveal.revealButton}</button>
      </div>
    {/if}
  {/if}

  {#if sent}
    <p class="sent">
      {reveal.sentNotice}
      {#if policy}
        <a href={policy} target="_blank" rel="noopener noreferrer">{reveal.policyLink}</a>
      {/if}
    </p>
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
  .via,
  .progress,
  .sent {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    overflow-wrap: anywhere;
  }
  .progress {
    font-style: italic;
  }
  .sent a {
    color: var(--accent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .actions button {
    padding: 0.5rem 1.1rem;
    border: 1px solid var(--button-bg);
    border-radius: 10px;
    background: var(--button-bg);
    color: var(--button-ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .actions button.secondary {
    background: transparent;
    color: var(--ink);
  }
</style>
