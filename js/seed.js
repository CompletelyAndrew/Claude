/* Bench · seed.js
 * First-run sample data so every module opens in a working state. Every
 * record carries `sample: true`; Settings → "Clear samples" removes them.
 */
(function (Bench) {
  'use strict';
  const { store, uid } = Bench;

  const at = (days, h = null, m = 0) => {
    const d = new Date(); d.setHours(h ?? 0, h == null ? 0 : m, 0, 0); d.setDate(d.getDate() + days);
    return d.toISOString();
  };
  const day = offset => Bench.ledger.isoDay(new Date(Date.now() + offset * 864e5));

  Bench.seed = function seed() {
    store.set('tasks', [
      { title: 'Tune tank AI target leading', due: at(0, 16), hasTime: true, priority: 3, tags: ['tanks', 'godot'] },
      { title: 'Playtest Line Load vertical slice', due: at(1), priority: 2, tags: ['lineload'] },
      { title: 'Fix headless self-test flake on Windows', due: at(-1), priority: 3, tags: ['tanks', 'ci'] },
      { title: 'Reconcile September expenses', due: at(2), priority: 2, tags: ['money'], repeat: 'month' },
      { title: 'Export sprite sheet for the turret', due: at(3), priority: 1, tags: ['art'] },
      { title: 'Book hotel for the game jam weekend', due: at(5), priority: 1, tags: ['travel'] },
      { title: 'Write devlog #4', due: null, priority: 0, tags: ['writing'] },
      { title: 'Set up Unity IAP sandbox', done: true, doneAt: at(-1, 11), priority: 1, tags: ['unity'] },
    ].map(t => ({ id: uid(), done: false, due: null, hasTime: false, priority: 0, tags: [], repeat: null, created: at(-3), sample: true, ...t })));

    store.set('notes', [
      {
        title: 'Welcome to Bench', pinned: true, body:
`# Welcome to Bench

Bench is one place for the work around making things: tasks, notes, focus time, money, trips, and a lab of game-dev tools.

## Three things to try
- Press ==${Bench.isMac() ? '⌘K' : 'Ctrl K'}== and type **+ playtest fri 3pm #games** to add a task in plain English.
- Press **g** then a letter to jump: \`g t\` tasks, \`g n\` notes, \`g l\` Game Lab.
- Link notes with double brackets, like [[Tanks design notes]].

> Everything stays in this browser. Settings has a backup button.

These sample notes and tasks are marked *Sample*. Clear them from Settings when you're ready.`,
      },
      {
        title: 'Tanks design notes', body:
`# Tanks design notes

## AI aiming
Lead the target by projecting its velocity over the shell's flight time:

\`\`\`gdscript
var t := global_position.distance_to(target.global_position) / SHELL_SPEED
var aim := target.global_position + target.velocity * t
\`\`\`

- [x] Basic pursuit
- [x] Line-of-sight check before firing
- [ ] Lead moving targets
- [ ] Retreat when HP < 30%

## Tuning
| Param | Value | Notes |
|---|---|---|
| Shell speed | 420 | px/s |
| Turret turn | 2.4 | rad/s |
| Reload | 1.1 | s |

See also [[Line Load ideas]].`,
      },
      {
        title: 'Line Load ideas', body:
`# Line Load ideas

A minesweeper-meets-battleship puzzle. Each row "loads" when cleared.

- Clue numbers count ships *and* mines in the row
- ~~Timer~~ no timer, it fights the puzzle feel
- Daily seed so friends can compare boards

Back to [[Tanks design notes]].`,
      },
    ].map((n, i) => ({ id: uid(), updated: at(-i), pinned: false, sample: true, ...n })));

    store.set('focus', {
      settings: { work: 25, short: 5, long: 15 },
      sessions: [
        { start: at(0, 9, 10), minutes: 25, label: 'Tank AI' },
        { start: at(0, 9, 40), minutes: 25, label: 'Tank AI' },
        { start: at(-1, 14), minutes: 25, label: 'Line Load' },
        { start: at(-2, 10), minutes: 50, label: 'Devlog' },
        { start: at(-3, 20), minutes: 25, label: 'Line Load' },
        { start: at(-5, 9), minutes: 75, label: 'Sprites' },
      ].map(s => ({ ...s, sample: true })),
    });

    const tx = [
      [-1, 'Spotify', -1199, 'Subscriptions'], [-2, 'Steam', -1999, 'Software & Games'], [-3, 'Trader Joe\'s', -6342, 'Groceries'],
      [-4, 'Client: pixel art commission', 45000, 'Income'], [-5, 'Coffee Bar', -575, 'Dining'], [-6, 'Shell', -4210, 'Transport'],
      [-8, 'GitHub', -400, 'Software & Games'], [-9, 'Taco Spot', -1825, 'Dining'], [-12, 'Paycheck', 310000, 'Income'],
      [-14, 'Rent', -145000, 'Housing'], [-15, 'Comcast', -7000, 'Utilities'], [-17, 'Whole Foods', -8420, 'Groceries'],
      [-20, 'itch.io payout', 6830, 'Income'], [-24, 'Booking.com hotel', -21400, 'Travel'], [-28, 'Paycheck', 310000, 'Income'],
      [-33, 'Rent', -145000, 'Housing'], [-35, 'Groceries Market', -9120, 'Groceries'], [-38, 'JetBrains', -2490, 'Software & Games'],
      [-42, 'Paycheck', 310000, 'Income'], [-46, 'Restaurant Week', -6400, 'Dining'], [-50, 'Uber', -2380, 'Transport'],
      [-58, 'Paycheck', 310000, 'Income'], [-62, 'Rent', -145000, 'Housing'], [-66, 'Airline', -38900, 'Travel'],
      [-72, 'Paycheck', 310000, 'Income'], [-80, 'Unity Pro', -18500, 'Software & Games'], [-92, 'Rent', -145000, 'Housing'],
      [-95, 'Paycheck', 310000, 'Income'], [-110, 'Paycheck', 310000, 'Income'], [-122, 'Rent', -145000, 'Housing'],
      [-130, 'Steam sale', -5400, 'Software & Games'], [-140, 'Paycheck', 310000, 'Income'], [-152, 'Rent', -145000, 'Housing'],
    ];
    store.set('ledger', {
      currency: 'USD',
      budgets: { Dining: 25000, Groceries: 50000, 'Software & Games': 6000, Transport: 15000, Subscriptions: 3000 },
      txns: tx.map(([d, payee, amount, category]) => ({ id: uid(), date: day(d), payee, amount, category, sample: true })),
      invoice: {
        number: 'INV-0042', from: 'Your Studio\nyou@example.com', to: 'Pixel Harbor Games\nbilling@pixelharbor.example',
        date: day(0), due: day(14), taxRate: 0, discount: 0, notes: 'Thanks! Payment by bank transfer within 14 days.',
        items: [{ desc: 'Turret sprite sheet, 8 directions', qty: 1, rate: '320' }, { desc: 'Animation polish (hours)', qty: 3, rate: '45' }],
      },
    });

    store.set('trips', [{
      id: uid(), sample: true, name: 'Game jam weekend', place: 'Seattle, WA', start: day(12), end: day(14), budget: 60000,
      days: [
        { title: 'Travel + check in', items: ['Train 08:10', 'Check in after 3pm', 'Kickoff at 6pm, theme reveal'] },
        { title: 'Jam day', items: ['Scope by 10am', 'Playable by 6pm', 'Sleep at least 6h'] },
        { title: 'Ship + home', items: ['Submit build by 3pm', 'Play other entries', 'Train 19:40'] },
      ],
      packing: [
        ['Laptop + charger', 'Tech', true], ['USB-C hub', 'Tech', false], ['Controller', 'Tech', false], ['Headphones', 'Tech', true],
        ['Notebook', 'Work', false], ['ID + tickets', 'Docs', true], ['Hoodie', 'Clothes', false], ['Rain jacket', 'Clothes', false],
      ].map(([text, group, done]) => ({ id: uid(), text, group, done })),
    }]);

    store.set('settings', { theme: 'system' });
  };

  Bench.clearSamples = function clearSamples() {
    store.update('tasks', l => l.filter(x => !x.sample), []);
    store.update('notes', l => l.filter(x => !x.sample), []);
    store.update('focus', f => ({ ...f, sessions: (f.sessions || []).filter(x => !x.sample) }), { sessions: [] });
    store.update('ledger', l => ({ ...l, txns: (l.txns || []).filter(x => !x.sample) }), { txns: [] });
    store.update('trips', l => l.filter(x => !x.sample), []);
  };
})(window.Bench);
