# Scraping Log — Niche Discovery (SanchoCMO)
> Actualizado: 2026-03-05 | Rondas: 2

## Resumen
- **URLs intentadas**: 21
- **URLs scrapeadas con éxito**: 15
- **URLs fallidas**: 6
- **Comments reales leídos**: ~200+
- **Citas textuales extraídas**: 25+
- **Fuentes distintas**: Reddit (11 subreddits), HN (0 útiles), foros hispanos (0 — bloqueados)

## URLs scrapeadas con éxito

| # | URL | Subreddit | Método | Upvotes | Comments | Citas útiles |
|---|-----|-----------|--------|---------|----------|-------------|
| 1 | reddit.com/r/startups/1l4akwe | r/startups | .json API | 14 | 23 | 3 |
| 2 | reddit.com/r/Startup_Ideas/1ok6f1m | r/Startup_Ideas | .json API | 53 | 4 | 3 |
| 3 | reddit.com/r/generativeAI/1ngmc33 | r/generativeAI | .json API | 3 | 11 | 2 |
| 4 | reddit.com/r/SaaS/1jo4put | r/SaaS | .json API | — | 3 | 3 |
| 5 | reddit.com/r/Entrepreneur/1i9xc0u | r/Entrepreneur | .json API | 10+ | 25+ | 2 |
| 6 | reddit.com/r/Entrepreneur/1jkj18f | r/Entrepreneur | old.reddit | — | OP | 1 |
| 7 | reddit.com/r/PPC/1kd3sc5 | r/PPC | old.reddit | — | OP | 1 |
| 8 | reddit.com/r/Entrepreneur/xe65lp | r/Entrepreneur | .json API | 10 | 38 | 1 |
| 9 | reddit.com/r/startups/oigaxw | r/startups | .json API | **129** | **88** | 2 |
| 10 | reddit.com/r/SaaS/1qx8bzd | r/SaaS | .json API | **897** | **853** | 2 |
| 11 | reddit.com/r/startups/1gqxy2c | r/startups | .json API | 10 | 3 | 1 |
| 12 | reddit.com/r/SaaS/1rjoto7 | r/SaaS | .json API | 8 | — | 2 |
| 13 | reddit.com/r/marketing/1pjwl7v | r/marketing | .json API | 3 | 34 | 3 |
| 14 | r/digital_marketing search results | r/digital_marketing | search .json | — | listings | 1 (full text Head of Mktg post) |
| 15 | r/marketing search results | r/marketing | search .json | — | listings | 0 |

## URLs fallidas

| # | URL | Razón |
|---|-----|-------|
| 1 | reddit.com/r/Entrepreneur/1i0rccq | Firecrawl 403 |
| 2 | reddit.com/r/digital_marketing/1j38eel | Firecrawl 403 (full text recovered via search) |
| 3 | g2.com/products/jasper/reviews | Timeout |
| 4 | capterra.com/p/187640/Jasper/reviews | Timeout |
| 5 | reddit.com/r/espanol/search | 0 results |
| 6 | reddit.com/r/emprendimiento/search | Firecrawl 403 |

## Intentos no-Reddit

| Fuente | Resultado |
|--------|-----------|
| HN Algolia API (3 queries) | 0 resultados relevantes (matches irrelevantes) |
| IndieHackers (1 URL) | Devuelve homepage, no post específico |
| G2 reviews | Bloqueado por timeout |
| Capterra | Bloqueado por timeout |
| Foros hispanos (r/espanol, r/emprendimiento) | 0 resultados / bloqueado |

## Limitaciones reconocidas
- **No se pudieron scrapear reviews de G2/Capterra** (bloqueados) → falta evidence de reviews de herramientas
- **No se pudieron scrapear foros en español** (bloqueados o vacíos) → falta evidence del mercado hispano
- **HN no retornó resultados relevantes** → los queries de HN Algolia no matchean bien para este tema
- **Reddit rate limiting** afectó r/marketing y r/digital_marketing en ronda 1

## Citas textuales extraídas (master list)

### Solo Founder Overwhelm
- "I feel extremely overwhelmed. The more my startup grows the more I realize there is A LOT more work that needs to be done. Not only do I work on everything like the site and actual product, but im trying my best to market it as well. I am starting to realize that the marketing alone for the startup is a full-time job." — u/dr7s, r/startups (129↑, 88 comments)
- "I'm a dev, not a marketer. I have no idea how to actually 'scale' a business" — OP, r/SaaS (897↑)
- "I'm a developer first, marketer maybe fifth. Building the tech was the easy part. I'm terrified I have 'developer brain'" — OP, r/SaaS/1rjoto7

### Head of Marketing / Primer Marketer Chaos
- "We pivoted every month! Forget about me, Google doesn't even know what we do." — Head of Marketing, r/digital_marketing (6 months as HoM at pivoting SaaS)
- "There is no ICP. We're targeting everyone." — co-founder quote in r/digital_marketing
- "Generate 100,000 visitors in 7 days. Without ad budget. On a site I couldn't edit. With no clear messaging. No finalized offer. And still do it solo." — Head of Marketing, r/digital_marketing
- "Direct copy-pasted output from ChatGPT generated out of a shitty prompt." — Head of Marketing describing co-founder's landing page, r/digital_marketing
- "Do you even want your salary?" — co-founder to Head of Marketing who built $1.1M pipeline, r/digital_marketing

### AI Tools Frustration
- "Those tools are okay, but I find I get a much better squeeze just using ChatGPT. The secret sauce is ensuring the chat window is trained really well on your use case using classic marketing strategy. With that, it hums. Without, it creates trash." — u/Kbartman, r/startups (7↑)
- "most founders overestimate what ai can automate and underestimate what it can clarify. ai won't save you from chaos - it just mirrors it" — u/Thin_Rip8995, r/Startup_Ideas
- "AI is great for automating the grunt work but you still need human brains for the actual strategy and creative stuff" — u/devhisaria, r/Startup_Ideas
- "output feels too generic, voiceovers sound robotic, easy to lose that 'human touch'" — u/_rahmatullah, r/generativeAI (OP)
- "gen AI is typically fast and cheap with low quality (about the quality of a student or a beginner). I use AI basically when I want something fast, cheap, and with low quality." — u/alone_in_the_light, r/marketing (2↑)
- "The real win isn't AI replacing marketing - it's killing blank-page time so you can focus on judgment n creativity" — u/One_Title_6837, r/marketing (2↑)
- "The bottleneck was never the writing itself, but connecting the dots between strategy, research, and execution... the 'strategy-to-execution disconnect'" — u/Professional_Tax5308, r/marketing (3↑)
- "your prompts decide the quality and relevance of the output" — u/Fun_Ostrich_5521, r/marketing

### Strategy-to-Execution Disconnect
- "Make sure positioning, messaging and ICP are tight. Focus on only 1-2 marketing channels. It takes discipline to say no" — u/Steven_Macdonald, r/startups (5↑, 15 years marketing)
- "Market research > macro trends > customer segments > competitive landscape > value prop > positioning > market entry > brand. I've been automating each segment using GPT. It works well enough I'm fairly concerned about my career" — u/Kbartman, r/startups (4↑)
- "Managing Google and Meta ads manually takes hours every week, even small mistakes can impact results" — OP, r/Startup_Ideas (53↑)
- "ads and marketing eat up way too much time" — u/muabaca, r/Startup_Ideas

### Agencies
- "you probably will never be their most important client. You pay for x amount of hours. Agencies tend to stick to their known framework and playbook" — u/lnavatta, r/SaaS
- "early state founders can't afford what a great agency charges, so they go with second or third tier options and you get what you pay for" — u/lnavatta, r/SaaS
- "Not the most important client. Rigid frameworks. Too expensive for small founders. Vicious loop" — u/NerdCurry, r/SaaS (OP summary)
- "a lot of overpromising and underdelivering. The key is really about execution and accountability" — u/theADHDfounder, r/SaaS
- "I found in my business that I struggled until I found a mentor that knew exactly where I was" — u/[author], r/Entrepreneur

### Mentor/Knowledge Gap
- "I found in my business that I struggled until I found a mentor that knew exactly where I was" — r/Entrepreneur/xe65lp
