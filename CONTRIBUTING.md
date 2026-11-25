# Contributing

Thanks for looking. This is a small, seasonal project, so the bar is "small and obviously better".

**Welcome:**
- Bug fixes in `src/lights-svg.mjs` (rendering glitches, odd calendars, a renderer that chokes on the SVG)
- Accessibility and reduced-motion improvements
- Typos and clearer docs

**Please keep in mind:**
- The builder stays a single, dependency-free ES module: no build step, no DOM, no network calls.
- The output should stay small (under 80 KB for a full year) and calm: opacity-only twinkle, nothing faster than a 4-second cycle, and a still frame that's the finished picture.
- Run `node examples/render.mjs` and open a couple of the SVGs before you send a PR.
- Open an issue first for anything bigger than a small fix, so we can agree on it before you spend the time.

**Not accepted:**
- Analytics, tracking pixels, telemetry, or anything that phones home
- Changes that collect more data about users or README visitors
- GitHub logos, the Octocat, or anything that imitates GitHub's UI

Opt-out requests aren't PRs. Use the [opt-out issue template](https://github.com/dIwnsgml/commit-lights/issues/new?template=opt-out.md) from your own account.

By contributing you agree your contribution is licensed under the MIT License.
