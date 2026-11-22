// Format: https://developer.themoviedb.org/reference/tv-series-watch-providers
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
export default {
  id: 900002,
  results: {
    FR: {
      link: 'https://www.themoviedb.org/tv/900002/watch?locale=FR',
      ads: [
        {
          provider_id: 9901,
          provider_name: 'Lantern Screen',
          logo_path: '/lantern-screen.png',
          display_priority: 1
        }
      ],
      flatrate: [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/synthetic-netflix.png',
          display_priority: 0
        }
      ]
    }
  }
};
