# Composer usage footer

## Ownership

The footer owns three readings: the session's spend at the start of the centered
cluster, the current provider's quota windows beside it with the usage popover
those meters open, and the session's context fill at the cluster's end with its
own popover. The quota store owns provider data, refresh, account invalidation and
runtime isolation; `components/usage` owns grouping. The footer derives pace
for display from existing quota percentages, window duration and reset
timestamps. It reads the context fill with the header's reading hook, given the
composer's own session, so the two agree whenever that session is the live one.

Tokens, cache and speed are not composer readings beyond the cache row in the
context popover; composer pins belong only to this footer.

## Invariants

- The line spans the composer's width with the three pills centered as one
  cluster: spend, the quota meters, then the context reading. Each pill owns its
  background on the elevated tone, so the three read as separate controls rather
  than one run of text. A provider with no windows or shares still appears in
  the popover with its status. The meters pill is absent when no provider
  reports anything, the spend pill while the rollup total is zero, and the
  context pill in a draft. Without a quota provider the line still shows spend
  and context. Hover detail uses the shared `Tooltip`, not a browser `title`
  box, and its times follow the 12/24-hour preference.
- Each pill marks its root with `data-usage-pill`. The row hides through CSS
  `:has` while no pill is mounted, and the composer form tightens its bottom
  padding on desktop by the same test. The pills learn their data on their own,
  so neither the line nor the composer re-renders to find out whether the row is
  empty, and an empty row takes no space.
- Spend and context read the composer's own session and directory, which
  ChatInput passes in. A pinned chat column shows its own session's figures,
  never the live session's. The header and the rail keep the live session
  through `useCurrentContextReading`.
- The spend segment is the rollup total from `work-status/useSubagentCostRollup`,
  the same figure and formatter the Work status card writes next to its context
  row, so a subagent's spend cannot hide from either surface. A click opens a
  small popover: the total in the header, then the session and subagent split as
  label and figure rows once a subagent has spent; without one the total is the
  session's own cost and the extra rows would restate it. Rows use the same
  `UsageDetailRow` as the context popover, so every reading's figures line up.
  It owns its subscription: a streamed step re-renders that figure, not the
  composer.
- The context segment is the header's: the same ring and the same tone ramp
  through `contextRingTone`. It opens a popover rather than the full context
  panel, because the line is a glance and the panel covers the chat. The
  popover shows the fill, its bar, used tokens, the context limit and the last
  reply's cache hit. Spend has its own pill in the same cluster, so it is not
  repeated here. The cache figure is the one the Work status card shows: the
  reading hook returns it from the same message list as the fill, so a streamed
  step that moves neither figure re-renders nothing. The body mounts only while
  open. The gauge budgets the meters from the row less the spend and context
  pills and the gaps, so a long provider name folds before the cluster outgrows
  the composer.
- The footer stays outside the measured composer box and renders alongside the
  header and Work Status. Comment and BTW composers do not show it.
- Each reading is its own opaque pill on the elevated tone, like the status and
  scroll pills: the meters are one button, the spend figure another, and the
  context segment a third. The row spans the composer's width and the cluster
  centers in it, so the pills stay together whether there are three, two, or
  any one of them alone. It sits in the floating composer slot over the transcript, so a
  transparent line showed the message text through it.
- Typing does not commit the footer. It owns its subscriptions; measurement copies
  render presentation only, without data subscriptions or refresh demand.
- Natural content widths determine fit, including localized labels and font
  sizes. The gauge collapses through all windows, one window per provider, the
  first provider, then its icon. It never wraps or widens the composer.
- Hidden measurements sit in clipped zero-size containers. Invisible absolute
  content still contributes to scroll width unless its container clips it.
- ChatInput passes its effective provider, including pinned-column selection and
  unsent agent model changes. The footer never re-derives that selection from a
  saved session model. It shows that provider before composer pins and uses the
  existing provider aliases for quota identity.
- Independent profile preference composerUsagePinnedProviders never changes the
  quota store's dropdownProviderIds. Pins publish only after the existing settings
  writer confirms the save; failure leaves the saved selection and shows an error.
  A feature-local action store serializes pin writes across all composer columns
  and popover lifetimes. Closing, reopening or using another column cannot start
  a conflicting write from an unconfirmed selection. The lock is transient and
  releases after either success or failure; the settings writer owns runtime capture.
- The popover mounts its body only while open. Base UI owns placement, dismissal
  and keyboard focus restoration. The shared height morph handles expanded bodies.
- The popover lays each provider's windows on one grid, so labels, bars, figures
  and reset times line up across rows: label up to 7rem, a flexible bar, then the
  figure and reset at their content width. Folded headers repeat the same meter
  at a 6rem label cap. The popover is 22.5rem wide and 26rem below 1024px, where
  the small-window layouts can raise type, and never wider than the viewport.
  Below 640px the grid takes the narrower columns; below 480px folded previews
  disappear, leaving the provider name readable.
- The popover uses one type size, so a popover holding several providers stays a
  dense list: provider headers, window rows and figures read at micro, and weight
  separates a header from its rows. A 1px rule at 14% of the
  foreground separates provider sections, so the list reads as providers rather
  than one run; the theme's border token sits within a few points of the popover
  fill and disappeared at this size. The sections add no gap of their own. The trigger is denser: a
  20px pill at 11px on desktop, at 13px where the app raises type for touch
  widths, which is the scale the compact status pills use.
- A window's bar takes Settings Usage's tone ramp from its unrounded used
  percentage: green below half, amber from half, red from eighty. A forecast may
  raise the tone, because a window that drains before it resets needs attention
  while its figure is still low, but it never lowers it. The tone follows the
  used percentage in both display modes, so remaining mode colours one window the
  same way as usage mode. A window with no used share shows no bar. The figure
  beside it stays neutral while the window is on pace, as Settings Usage keeps
  it, and turns amber or red only for a forecast or an empty window.
- A folded provider previews only its provider-level windows. With model-only
  windows the header keeps the name alone: two models' readings would need their
  names beside the provider, and those do not fit in the header.
- The existing quota store supplies all configured providers, including extensions.
  The full popover includes every model window; existing compact consumers keep
  their selected-model and first-window filtering.
  Unconfigured providers are absent; stale samples remain beside refresh errors.
  Disabling the footer releases its refresh demand. No new quota timer or
  credential flow belongs here.
- Forecasts require a future reset, a positive duration, at least 20% of the
  window elapsed and at least 3% used. A missing input produces no forecast.
  Exhaustion and pace urgency determine the single window kept in tight mode.
  Tight mode ranks all eligible model windows before selecting one, including
  lower-used windows omitted from the two-window full summary.
- Provider responses expose one account per provider. Additional-account sections
  and live serving-account flags are absent until an authoritative contract exists.

## Decisions

### Why the line holds spend, quota and context

These are the figures that move while a reply streams and that decide whether to
keep going: what the session has cost, how much of the provider's quota is left,
and how full the context is. Cache, token and speed figures stay in the Work
Status card, because repeating them under the composer gives the same numbers two
places to be read. Only the cache hit appears, inside the context popover, beside
the fill it explains. The three readings are separate pills, so they read as
three controls instead of one run of text.

### Why the row spans the composer and the parts stay separate

The compact pill sized itself to its content and sat centred, so three readings
in a row read as one sentence: a price, a provider name and a ring with nothing
between them. The row now takes the composer's width and each reading is its own
pill, so the spend, the meters and the context never read as one continuous
surface. The three pills first sat at the two ends with the meters between them;
once the quota pill folded to a lone icon that icon floated alone in the middle
of the row. The cluster is centered instead, so the readings always keep their
order and stay together. Because the middle cell is sized by the meters it
holds, the ladder's budget is computed from the row and the two end pills.

### Why actual widths determine collapse

Fixed column thresholds hide data that fits and still overflow with long
translated labels. The gauge measures the natural width of each detail level
instead. Presentation-only copies measure that content without duplicating store
or network work.

### Why the meters use the usage tone ramp

An on-pace window could stay neutral, as the context ring does until its warning
threshold. A healthy window and an unmeasured one then look the same, while
Settings Usage already colours the same percentages green, amber and red. The
meter takes that ramp, from the same unrounded percentage Settings Usage tones.
The figure keeps Settings Usage's neutral treatment and only warns where the
forecast does.

### Why hover detail uses the shared tooltip

The first version put every detail in a `title` attribute. That box is drawn by
the browser, ignores the theme and arrives on its own delay, so it looked unlike
every other control on the desktop. The footer uses the shared `Tooltip` instead,
the same one Work Status rows and the header use.

### Why the footer opens its own usage popover

The meters are where the reader looks while writing, so the details behind them
open from the same place: every window with its reset, the other providers
folded, pins, refresh, and a link to Settings Usage. Sending the reader to Work
Status would mean opening a panel, which the line exists to avoid.

### Why composer pins use a separate preference

The existing dropdown provider list controls Work Status, header and tray. Sharing
it with composer pins would change those areas when the reader pins a footer meter.
A profile field uses the existing settings writer, parser and bridge snapshots.
Older clients ignore it without changing their provider selection.

### Why quota refresh stays with the existing store

The footer and open popover join the store's existing all-provider demand so the
current model and composer pins can appear independently of Work Status visibility.
Its three-minute refresh, visibility gates, request coalescing and stale-data rules
remain authoritative. Manual refresh has a 30-second UI cooldown, so repeated
clicks do not send repeated requests to the providers.
