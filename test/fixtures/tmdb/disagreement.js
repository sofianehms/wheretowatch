// Format: https://developer.themoviedb.org/reference/movie-watch-providers
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
export default {
  id: 900001,
  results: {
    FR: {
      link: 'https://www.themoviedb.org/movie/900001/watch?locale=FR',
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
