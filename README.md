# Commit Lights

Your contribution graph, strung up as Christmas lights. Busiest days glow brightest, quiet days flicker faintly, and the whole string twinkles in your profile README all December.

[![A year of contributions as a string of twinkling Christmas lights](https://commitlights.e5d.workers.dev/api/lights/_sample.svg)](https://commitlights.e5d.workers.dev/?utm_source=github&utm_medium=ours&utm_campaign=repo)

One line in your README. No sign-in, no token.

## Light up yours in 30 seconds

1. Go to **[commitlights.e5d.workers.dev](https://commitlights.e5d.workers.dev/?utm_source=github&utm_medium=ours&utm_campaign=repo)** and type your GitHub username.
2. Hit **Copy README snippet**.
3. Paste it anywhere in your profile README (the repo named exactly like you: `github.com/YOUR-USERNAME/YOUR-USERNAME`) and commit.

Or skip the site. This is the whole line, with your username in both places:

```markdown
[![@YOUR-USERNAME's contributions as Christmas lights](https://commitlights.e5d.workers.dev/api/lights/YOUR-USERNAME.svg)](https://commitlights.e5d.workers.dev/?u=YOUR-USERNAME&utm_source=readme&utm_medium=embed&utm_campaign=s1)
```

Keep it on one line. A blank line inside a README's HTML or link block breaks it.

No profile README yet? Create a public repo named exactly like your username and tick "Add a README". GitHub's guide: [Managing your profile README](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/managing-your-profile-readme).

## Themes and styles

The default image sits on its own dark night panel, so it reads on both GitHub themes, dev.to and most Markdown renderers.

Want it to blend into the reader's GitHub theme instead? Use the theme-matched version. It's transparent, and GitHub picks the dark or light image from the viewer's own setting:

```html
<a href="https://commitlights.e5d.workers.dev/?u=YOUR-USERNAME&utm_source=readme&utm_medium=embed&utm_campaign=s1">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://commitlights.e5d.workers.dev/api/lights/YOUR-USERNAME.svg?theme=dark">
    <img alt="@YOUR-USERNAME's contributions as Christmas lights" src="https://commitlights.e5d.workers.dev/api/lights/YOUR-USERNAME.svg?theme=light">
  </picture>
</a>
```

### Options

Image URL parameters (combine with `&`):

| Parameter | Values | Default | What it does |
|---|---|---|---|
| `style` | `classic`, `warm`, `candy` | `classic` | Bulb colours: red/orange/green/blue, warm white, or candy cane (red and white) |
| `theme` | `night`, `dark`, `light` | `night` | `night` brings its own dark panel. `dark` and `light` are transparent, for the `<picture>` version |
| `twinkle` | `gentle`, `medium`, `lively` | `medium` | How much the lights twinkle (see below). Anything else means `medium` |
| `motion` | `0` | on | `motion=0` serves still lights: the same picture with no animation at all. It wins over `twinkle` |

Examples: `.../YOUR-USERNAME.svg?style=warm`, `.../YOUR-USERNAME.svg?twinkle=gentle`, `.../YOUR-USERNAME.svg?style=candy&motion=0`. In the `<picture>` version, add the same parameters to both URLs.

Twinkle levels:

- `medium` (the default): lit bulbs blink down and back up with a little sparkle, and about one in three dark days glows faintly. One cycle every 2.2 to 3.8 seconds per bulb.
- `gentle`: only lit bulbs blink, every 2.8 to 4.5 seconds. Quiet days stay dark.
- `lively`: every bulb twinkles, dark days included, every 1.2 to 2.6 seconds.
- Off: use `motion=0`.

At every level, neighbours blink out of step, so the picture as a whole never flashes (its average brightness stays flat), and nothing cycles faster than 3 times a second. You can also pick the level on the site before you copy the snippet.

## How it works

- You type a username. We read that account's **public contribution calendar** from GitHub's official API: the same daily numbers anyone can see on the profile.
- Every day becomes a bulb. More contributions, brighter bulb. The 53 weeks and 7 weekdays stay exactly where they are on your graph.
- The image is a plain SVG: no scripts, no external references, no web fonts. GitHub's image proxy fetches it like any other README image.
- **No sign-in, no OAuth, no token from you.** We never ask for access to your account, and there's nothing to revoke.

### What's cached and stored

**About GitHub users:** the username, the public daily contribution counts and levels (the same numbers on the profile; deleted after 30 idle days), and timestamps (when it was fetched, when it was first and last shown on GitHub or another site), plus the hostname of a non-GitHub site that shows it. No names, emails, avatars, repos or IDs.

**About visitors to the site:** a random ID, which link you came from (UTM tags, referrer hostname), country and device class, and which steps you took. No IP is stored, and we never link a visit to a GitHub username. Global Privacy Control and Do Not Track are honoured.

**We never store who viewed what.** When your lights show on GitHub, the request comes from GitHub's image proxy, not from your visitors, so we can't see who looked at your profile, and we don't try to. All we keep is "shown on GitHub today", once per day.

Your calendar is cached for about 12 hours, then refreshed in the background.

## Privacy and opt-out

Your contribution graph is already public. Still, if you don't want your lights drawn here at all:

1. **[Open an opt-out issue](https://github.com/dIwnsgml/commit-lights/issues/new?template=opt-out.md)** titled `opt-out`, **from the GitHub account you want turned off**. Opening it from that account is how we know it's yours.
2. Within 72 hours your image switches to unlit bulbs with no name or numbers, and we delete the stored calendar.

To take the lights off your own README, just delete the line. We store nothing else about you.

## FAQ

**Does it animate in the GitHub mobile app?**
Maybe not. Some apps and image proxies drop SVG animation. The image is built so the still frame is the finished picture: every bulb lit at full brightness. You lose the twinkle, not the lights.

**I committed something. Why haven't my lights changed?**
Caching, twice over. We refresh your calendar about every 12 hours, and GitHub's image proxy and browsers keep a copy for a few hours on top of that. Expect changes within about a day. It's a yearly graph, so a few hours behind is fine.

**Does it respect reduced motion?**
The SVG stops all animation under `prefers-reduced-motion: reduce`. Not every browser passes that setting through to images inside `<img>`, so if you want the lights guaranteed still for every viewer, add `motion=0`.

**What about private contributions?**
They only count if you've turned on "Include private contributions" on your profile, and then only as the same anonymous counts GitHub already shows.

**It says "no lights here".**
That username doesn't exist, or it's an organisation (orgs don't have a contribution graph). Check the spelling.

**It says "lights warming up".**
We're briefly at our GitHub rate limit. That placeholder is only cached for 10 minutes, so your real lights replace it on their own soon after.

**Can I render it myself?**
Yes. The builder is in [`src/lights-svg.mjs`](src/lights-svg.mjs): one dependency-free ES module, MIT-licensed, the same code that draws the hosted image. See below.

## The builder

```js
import { buildLightsSvg, fromCounts } from "./src/lights-svg.mjs";

// one count per day from a Sunday, oldest first
const cal = fromCounts("2025-11-23", dailyCounts);
const svg = buildLightsSvg(cal, { user: "YOUR-USERNAME", theme: "night", style: "classic", motion: true });
```

- `buildLightsSvg(calendar, options) -> string` is a pure function. No DOM, no network, no fonts. It runs in Node 18+, browsers, Deno, Bun and edge runtimes.
- A calendar is `{ start, levels, counts, total }`: `start` is a Sunday (`YYYY-MM-DD`), and `levels` has one character per day, `"0"`-`"4"` (or `"."` for padding before a partial first week). `fromCounts(start, counts)` builds one from raw counts with GitHub-style quartile levels.
- Options: `theme`, `style`, `motion`, `twinkle`, `user`, `label`, `footer`, `unlit`, `seed`, `from`/`to` (a week slice) and `maxTwinkle`. They're documented in JSDoc at the top of the file.
- Also exported: `sampleCalendar(end)` (the synthetic year behind the demo image), `normalizeLogin(raw)` and `snippets(host, login, style)`.

Try it:

```sh
node examples/render.mjs   # writes examples/out/*.svg from a made-up calendar
```

Getting real contribution data is up to you. This repo makes no network calls and needs no token.

## Contributing

Small fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Found a bug? [Open an issue](https://github.com/dIwnsgml/commit-lights/issues/new?template=bug.md).

<!-- probe:start -->
<!-- Temporary camo cache test. The image goes between these two markers and is removed after the test. -->
<!-- probe:end -->

---

Commit Lights is an independent project, not affiliated with or endorsed by GitHub, Inc. GitHub is a trademark of GitHub, Inc.

Built by Jason Lee ([@dIwnsgml](https://github.com/dIwnsgml)) as part of a new app every 5 days ([@jasonevery5days](https://x.com/jasonevery5days)). MIT License, see [LICENSE](LICENSE).
