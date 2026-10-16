// Crawlers that gather pages for AI models, by the name each gives itself. They are asked to
// stay away in robots.txt and turned away when they come anyway. Search engines are welcome, and
// so are the fetchers an AI sends for a person who asked about a page, and the AI search
// engines that list the site and link to it.
export const AI_CRAWLERS = [
    'GPTBot',
    'ClaudeBot',
    'anthropic-ai',
    'CCBot',
    'Bytespider',
    'Amazonbot',
    'meta-externalagent',
    'FacebookBot',
    'cohere-ai',
    'cohere-training-data-crawler',
    'Diffbot',
    'Timpibot',
    'ImagesiftBot',
    'PanguBot',
    'AI2Bot',
    'Ai2Bot-Dolma',
    'omgili',
    'Webzio-Extended',
    'FriendlyCrawler',
    'Kangaroo Bot',
    'img2dataset',
    'YouBot',
    'ICC-Crawler',
    'TikTokSpider',
    'Brightbot',
    'Crawlspace',
    'SBIntuitionsBot',
    'Cotoyogi',
    'iaskspider',
]

// Not crawlers of their own: they say whether what a search engine's crawler took may train its
// owner's models, so the search keeps the site and the training does not.
const TRAINING_ONLY = ['Google-Extended', 'Applebot-Extended']

const named = AI_CRAWLERS.map((name) => name.toLowerCase())

export const isAiCrawler = (agent: string | undefined): boolean => {
    const said = (agent ?? '').toLowerCase()
    return named.some((name) => said.includes(name))
}

export const ROBOTS = [...[...AI_CRAWLERS, ...TRAINING_ONLY].map((name) => `User-agent: ${name}`), 'Disallow: /', '', 'User-agent: *', 'Allow: /', ''].join('\n')
