<script lang="ts">
  import { onMount } from "svelte";
  import { checkText, type CheckOutcome } from "./lib/check";
  import { readFragmentLink } from "./lib/fragment";
  import ResultCard from "./lib/ResultCard.svelte";
  import { strings } from "./lib/strings";

  let text = $state("");
  let outcome = $state<CheckOutcome | null>(null);

  function run() {
    outcome = checkText(text);
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    run();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      run();
    }
  }

  function loadFromFragment() {
    const link = readFragmentLink(window.location.hash);
    if (link === null) return;
    text = link;
    run();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  onMount(() => {
    loadFromFragment();
    window.addEventListener("hashchange", loadFromFragment);
    return () => window.removeEventListener("hashchange", loadFromFragment);
  });
</script>

<main>
  <header class="intro">
    <h1>{strings.appName}</h1>
    <p class="tagline">{strings.tagline}</p>
    <p class="privacy">{strings.privacy}</p>
  </header>

  <form onsubmit={onSubmit} novalidate>
    <label for="input">{strings.fieldLabel}</label>
    <p id="hint" class="hint">{strings.fieldHint}</p>
    <textarea
      id="input"
      rows="5"
      bind:value={text}
      onkeydown={onKeydown}
      aria-describedby="hint shortcut"
      autocapitalize="off"
      autocomplete="off"
      spellcheck="false"></textarea>
    <div class="actions">
      <button type="submit">{strings.analyze}</button>
      <p id="shortcut" class="hint">{strings.shortcut}</p>
    </div>
  </form>

  <p class="sr-only" role="status" aria-live="polite">
    {outcome?.kind === "results" ? outcome.announcement : ""}
  </p>

  {#if outcome?.kind === "message"}
    <p class="notice" role="status">{outcome.message}</p>
  {:else if outcome?.kind === "results"}
    <section class="results" aria-labelledby="results-heading">
      <h2 id="results-heading" class="sr-only">{strings.resultsHeading}</h2>
      {#each outcome.items as item, index (index)}
        <ResultCard {item} />
      {/each}
    </section>
  {/if}
</main>

<style>
  main {
    width: 100%;
    max-width: 42rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    display: grid;
    gap: 1.25rem;
  }
  h1 {
    margin: 0;
    font-size: 1.9rem;
    letter-spacing: -0.01em;
  }
  .tagline {
    margin: 0.15rem 0 0;
    font-size: 1.1rem;
  }
  .privacy,
  .hint {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.92rem;
  }
  form {
    display: grid;
    gap: 0.35rem;
  }
  label {
    font-weight: 600;
  }
  textarea {
    width: 100%;
    margin-top: 0.35rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-family: var(--font-mono);
    font-size: 0.95rem;
    resize: vertical;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 0.5rem;
  }
  .actions .hint {
    margin: 0;
  }
  button {
    padding: 0.6rem 1.4rem;
    border: 0;
    border-radius: 10px;
    background: var(--button-bg);
    color: var(--button-ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .notice {
    margin: 0;
    padding: 0.9rem 1rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .results {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
</style>
