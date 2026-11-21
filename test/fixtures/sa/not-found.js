// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 2026-11-21. This fixture is hand-written, not a recorded response.
export default {
  id: '99003',
  showType: 'movie',
  title: 'Paper Observatory',
  releaseYear: 2024,
  tmdbId: 'movie/900003',
  streamingOptions: {
    fr: [
      {
        service: { id: 'lantern', name: 'Lantern Screen', homePage: 'https://lantern.example/' },
        type: 'subscription',
        link: 'https://lantern.example/watch/paper-observatory',
        quality: 'hd',
        audios: [],
        subtitles: [],
        expiresSoon: false
      }
    ]
  }
};
