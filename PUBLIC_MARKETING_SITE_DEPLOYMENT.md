# TWIGA public marketing site deployment

The canonical public marketing website is maintained in:

- Repository: https://github.com/michaelmuchemi33-design/ai-receptionist-kenya
- Production branch: `main`
- Website: https://twiga.co.ke
- Cloudflare Pages project: `twiga-public-site`

The `.github/workflows/deploy-all-twiga-cloudflare.yml` workflow checks out the marketing repository's `main` branch, copies its public site files into the Pages deployment directory and deploys them to Cloudflare Pages.

## Release recorded on 23 November 2026

Source revision: `a6cd4e81e6fac4c988064325f9b61b92fc14dcbf`

This revision includes the supplied TWIGA giraffe logo, shared favicon and brand styles, the branded page loading screen, a complete product explainer exceeding 2,800 words, and the 100-industry receptionist directory. The `ai.txt`, `llms.txt`, `content.txt`, web manifest and sitemap have also been updated.

The marketing repository is the source of truth for public website content. The Cloudflare deployment workflow should be run after changes to that repository are merged to `main`.
