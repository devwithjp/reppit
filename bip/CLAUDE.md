# reppit campaign desk

The campaign desk prepares reviewed material. It does not publish to X.

## Allowed workflow

1. `bip/run-campaign.sh` checks the randomized schedule.
2. When a night is due, `bip/campaign.mjs tick` creates a private local review page and desktop notification.
3. A person reviews the copy and figures, opens X themselves, and clicks Post themselves.
4. After both posts are live, record their canonical URLs with:

   ```bash
   node bip/campaign.mjs mark-posted <day> <post-1-url> <post-2-url>
   ```

5. Automatic publishing may be added only through the official X API and must preserve approval, idempotency, rate-limit, and stop-on-error controls.

## Prohibited workflow

Do not use Playwright, Chrome DevTools Protocol, browser extensions, remote debugging, simulated typing, saved browser profiles, or DOM selectors to compose or publish posts on X. Do not automate likes, follows, reposts, replies, or direct messages.

Campaign copy remains in `docs/tweets.md`; figures remain in `bip/campaign-assets/`; schedule and approval data remain in `bip/queue.json` and `bip/campaign-state.json`.
