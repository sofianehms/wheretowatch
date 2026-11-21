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
    fr: [
      {
        service: { id: 'lantern', name: 'Lantern Screen', homePage: 'https://lantern.example/' },
        type: 'subscription',
        link: 'https://lantern.example/watch/glass-orchard',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
