# Social Content Calendar Analysis Patterns

## What to Extract from Social Profiles

### 1. Content Pillars
Identify the 3-5 themes they rotate through:
- **Educational** - How-to, tips, guides
- **Social Proof** - Testimonials, case studies, results
- **Product** - Features, updates, demos
- **Culture** - Team, behind-the-scenes, values
- **Engagement** - Polls, questions, UGC

### 2. Format Distribution
Count posts by format over last 30 days:
- **Text posts** - %
- **Images** - % (single vs carousel)
- **Videos** - % (short-form vs long-form)
- **Links** - %
- **Polls/Interactive** - %

### 3. Posting Cadence
- **Frequency** - Posts per day/week
- **Best days** - When do they post most?
- **Best times** - Morning, afternoon, evening?
- **Consistency** - Regular schedule vs sporadic?

### 4. Engagement Patterns
For each post type, note:
- **Avg likes/reactions**
- **Avg comments**
- **Avg shares/retweets**
- **Top-performing posts** (outliers)

### 5. Content Themes That Work
- **What gets most engagement?** - Topic + format
- **What drives conversations?** - Comment magnets
- **What gets shared?** - Viral potential
- **What flops?** - Low engagement patterns

## Platform-Specific Patterns

### LinkedIn
- **Length** - Short (<150 words) vs long-form (500+)
- **Hooks** - First line determines scroll-stop
- **Formatting** - Line breaks, emojis, bullet points
- **Personal vs Brand** - Founder voice vs company voice

### Twitter/X
- **Thread strategy** - Single tweets vs threads
- **Visual usage** - Images in tweets that perform
- **Reply game** - Do they engage in replies?
- **Timing** - Real-time vs scheduled

### Instagram
- **Reel strategy** - Frequency, style, hooks
- **Carousel strategy** - Educational slides vs storytelling
- **Caption length** - Short vs long captions
- **Hashtag usage** - Volume, specificity

## Analysis Workflow

1. **Scrape last 30-60 posts** from each platform
2. **Categorize by pillar** - Tag each post
3. **Measure engagement** - Calculate averages
4. **Identify top 10%** - What's common among winners?
5. **Spot patterns** - Days, times, formats
6. **Extract ideas** - What can we adapt?

## Output Format

```json
{
  "competitor": "Competitor Name",
  "platform": "LinkedIn",
  "date_range": "2026-01-20 to 2026-02-20",
  "posts_analyzed": 45,
  "insights": {
    "content_pillars": [
      {"pillar": "Educational", "percentage": 40, "avg_engagement": "high"},
      {"pillar": "Social Proof", "percentage": 30, "avg_engagement": "very high"}
    ],
    "posting_cadence": {
      "frequency": "3-4 posts/week",
      "best_days": ["Tuesday", "Thursday"],
      "best_times": ["9-11am CET"]
    },
    "top_performing_posts": [
      {
        "date": "2026-02-15",
        "pillar": "Social Proof",
        "format": "Carousel",
        "hook": "How [Client] grew 10x in 6 months",
        "engagement": "340 likes, 45 comments, 12 shares",
        "idea_for_us": "Case study carousel format with specific metrics"
      }
    ]
  }
}
```

## Tools for Scraping

- **LinkedIn**: Stealth browser (anti-scraping detection)
- **Twitter**: Official API if available, else browser scraping
- **Instagram**: Browser scraping (logged in)
- **Manual backup**: Screenshot + OCR if anti-bot is aggressive
