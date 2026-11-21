// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 2026-11-21. This fixture is hand-written, not a recorded response.
export default {
  id: '99001',
  showType: 'movie',
  title: 'The Glass Orchard',
  releaseYear: 2024,
  imdbId: 'tt99000001',
  tmdbId: 'movie/900001',
  streamingOptions: {
    us: [
      {
        service: { id: 'netflix', name: 'Netflix', homePage: 'https://www.netflix.com/' },
        type: 'subscription',
        link: 'https://www.netflix.com/title/99000001',
        quality: 'uhd',
        audios: [ { language: 'eng' }, { language: 'fra' } ],
        subtitles: [
          { locale: { language: 'eng' }, closedCaptions: true },
          { locale: { language: 'fra' }, closedCaptions: false }
        ],
        expiresSoon: true,
        expiresOn: 1796083200
      }
    ],
    fr: [
      {
        service: { id: 'netflix', name: 'Netflix', homePage: 'https://www.netflix.com/' },
        type: 'subscription',
        link: 'https://www.netflix.com/title/99000001',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
